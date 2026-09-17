import { Queue, Worker, type Job } from 'bullmq';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient, type Application } from '@prisma/client';
import {
  APPLICATION_QUEUE_NAME,
  DEAD_LETTER_QUEUE_NAME,
  createRedisConnection,
  type ApplicationJob,
} from '../applications/queue.js';
import { createHttpPartnerTransport, BankPartnerClient } from '../partner/client.js';
import { processOnboarding, recordKycFailure, recordTransition } from '../onboarding/service.js';

const prisma = new PrismaClient();
const kycServiceUrl = process.env.KYC_SERVICE_URL ?? 'http://localhost:8000';
const partnerServiceUrl = process.env.BANK_PARTNER_URL ?? 'http://localhost:4000';

type KycResponse = {
  extracted: { name: string | null; date_of_birth: string | null; id_number: string | null };
  fraud_signals: { blurry_image: boolean; name_mismatch: boolean; ocr_unavailable: boolean };
};
type RiskResponse = { score: number; flags: string[]; explanation: string };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function callKyc(application: Application): Promise<KycResponse> {
  if (!application.idDocumentUrl?.startsWith('/uploads/')) {
    throw new Error('Application has no local identity document');
  }
  const relativeDocumentPath = application.idDocumentUrl.slice(1);
  const candidatePaths = [
    path.resolve(relativeDocumentPath),
    path.resolve('apps/api', relativeDocumentPath),
  ];
  const documentPath = (await Promise.all(candidatePaths.map(async (candidate) => {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      return undefined;
    }
  }))).find(Boolean);
  if (!documentPath) throw new Error(`Uploaded document was not found: ${relativeDocumentPath}`);
  const document = await fs.readFile(documentPath);
  const form = new FormData();
  form.set('applicant_name', application.applicantName);
  form.set('use_llm', process.env.KYC_USE_LLM === 'true' && Boolean(process.env.ANTHROPIC_API_KEY) ? 'true' : 'false');
  form.set('document', new Blob([document]), path.basename(documentPath));
  const response = await fetch(`${kycServiceUrl}/kyc/extract`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`KYC service returned HTTP ${response.status}`);
  return (await response.json()) as KycResponse;
}

async function processRealApplication(applicationId: string): Promise<void> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) throw new Error(`Application ${applicationId} was not found`);
  if (application.status === 'SUBMITTED') {
    await recordTransition(
      prisma,
      applicationId,
      'SUBMITTED',
      'KYC_IN_PROGRESS',
      'KYC_PROCESSING_STARTED',
      {},
      { processingStarted: new Date() },
    );
  }
  const kyc = await callKyc(application);
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      kycExtractedName: kyc.extracted.name,
      kycIdNumber: kyc.extracted.id_number,
    },
  });
  const recentApplicationCount = application.deviceFingerprint
    ? await prisma.application.count({ where: { deviceFingerprint: application.deviceFingerprint } })
    : 0;
  const risk = await postJson<RiskResponse>(`${kycServiceUrl}/risk/score`, {
    fraud_signals: kyc.fraud_signals,
    recent_application_count: recentApplicationCount,
    use_llm: process.env.KYC_USE_LLM === 'true' && Boolean(process.env.ANTHROPIC_API_KEY),
  });
  const partner = new BankPartnerClient(createHttpPartnerTransport(partnerServiceUrl));
  await processOnboarding(prisma, partner, applicationId, risk);
}

/**
 * Runs one application through KYC, risk scoring, partner verification, and
 * onboarding. BullMQ retries infrastructure/provider failures; document errors
 * become terminal KYC_FAILED records so applicants receive a meaningful outcome.
 */
export async function processApplicationJob(job: ApplicationJob): Promise<void> {
  try {
    await processRealApplication(job.applicationId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'KYC processing failed';
    try {
      await recordKycFailure(prisma, job.applicationId, reason);
    } catch {
      // Preserve the original processing error so BullMQ can retry the job.
    }
    throw error;
  }
}

/**
 * Creates a BullMQ worker and dead-letter queue for application processing.
 * Exhausted jobs are copied to the DLQ so operators can inspect or replay them.
 */
export function createApplicationWorker(
  redisUrl: string,
  processor: (job: ApplicationJob) => Promise<void> = processApplicationJob,
) {
  const connection = createRedisConnection(redisUrl);
  const deadLetterQueue = new Queue<ApplicationJob>(DEAD_LETTER_QUEUE_NAME, { connection });
  const worker = new Worker<ApplicationJob>(
    APPLICATION_QUEUE_NAME,
    async (job: Job<ApplicationJob>) => processor(job.data),
    { connection, concurrency: 5 },
  );

  worker.on('failed', async (job, error) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }
    await deadLetterQueue.add('dead-letter-application', job.data, {
      jobId: `dead-letter-${job.id}`,
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 },
    });
    console.error(`Application job ${job.id} moved to dead-letter queue`, error);
  });

  return { connection, deadLetterQueue, worker };
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
if (process.argv[1]?.endsWith('worker.ts')) {
  createApplicationWorker(redisUrl);
  console.log(`CardAcquire worker listening on ${APPLICATION_QUEUE_NAME}`);
}