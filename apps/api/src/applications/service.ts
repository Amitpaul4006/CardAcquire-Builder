import { ApplicationStatus, Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { ApplicationJob, ApplicationQueue } from './queue.js';

export const applicationSubmissionSchema = z.object({
  dedupeKey: z.string().trim().min(1).max(255),
  applicantName: z.string().trim().min(2).max(200),
  dateOfBirth: z.coerce.date(),
  idDocumentUrl: z.string().max(2048).refine(
    (value) => value.startsWith('/uploads/') || URL.canParse(value),
    'Document URL must be a local upload path or absolute URL',
  ).optional(),
  deviceFingerprint: z.string().trim().min(1).max(255).optional(),
});

export type ApplicationSubmission = z.infer<typeof applicationSubmissionSchema>;

/**
 * Creates an application and its initial audit event, then enqueues KYC work.
 * The transaction makes the application and SUBMITTED event atomic; the unique
 * dedupe key makes client retries return the original application instead of
 * charging the downstream KYC path twice.
 */
export async function submitApplication(
  prisma: PrismaClient,
  queue: ApplicationQueue,
  userId: string,
  ipAddress: string | undefined,
  input: unknown,
) {
  const submission = applicationSubmissionSchema.parse(input);
  const existing = await prisma.application.findUnique({
    where: { dedupeKey: submission.dedupeKey },
  });

  if (existing) {
    if (existing.userId !== userId) {
      throw new ApplicationConflictError('Dedupe key is already owned by another user');
    }
    return { application: existing, duplicate: true };
  }

  let application;
  try {
    application = await prisma.$transaction(async (transaction) => {
      const created = await transaction.application.create({
        data: {
          userId,
          dedupeKey: submission.dedupeKey,
          applicantName: submission.applicantName,
          dateOfBirth: submission.dateOfBirth,
          idDocumentUrl: submission.idDocumentUrl,
          deviceFingerprint: submission.deviceFingerprint,
          ipAddress,
          status: ApplicationStatus.SUBMITTED,
        },
      });

      await transaction.auditTrail.create({
        data: {
          applicationId: created.id,
          toStatus: ApplicationStatus.SUBMITTED,
          event: 'APPLICATION_SUBMITTED',
          metadata: { source: 'api' },
        },
      });

      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const concurrentApplication = await prisma.application.findUnique({
        where: { dedupeKey: submission.dedupeKey },
      });
      if (concurrentApplication?.userId === userId) {
        return { application: concurrentApplication, duplicate: true };
      }
      throw new ApplicationConflictError('Dedupe key is already owned by another user');
    }
    throw error;
  }

  const job: ApplicationJob = { applicationId: application.id };
  try {
    await queue.enqueue(job);
  } catch (error) {
    throw new ApplicationQueueError('Application saved but KYC processing could not be queued', {
      cause: error,
      applicationId: application.id,
    });
  }

  return { application, duplicate: false };
}

export class ApplicationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplicationConflictError';
  }
}

export class ApplicationQueueError extends Error {
  readonly applicationId: string;

  constructor(message: string, options: { cause: unknown; applicationId: string }) {
    super(message, { cause: options.cause });
    this.name = 'ApplicationQueueError';
    this.applicationId = options.applicationId;
  }
}