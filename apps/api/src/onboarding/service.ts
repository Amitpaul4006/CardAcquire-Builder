import { ApplicationStatus, type PrismaClient } from '@prisma/client';
import type { PartnerVerificationResponse } from '../partner/client.js';

export interface RiskAssessment {
  score: number;
  flags: string[];
  explanation: string;
}

export interface OnboardingProcessor {
  verify(applicationId: string): Promise<PartnerVerificationResponse>;
}

export interface OnboardingResult {
  applicationId: string;
  status: ApplicationStatus;
  riskScore: number;
  partnerReference?: string;
  decisionReason: string;
}

export class ApplicationNotFoundError extends Error {
  constructor(applicationId: string) {
    super(`Application ${applicationId} was not found`);
    this.name = 'ApplicationNotFoundError';
  }
}

/**
 * Atomically updates an application state and appends its audit event.
 * Keeping these writes together ensures operators never see a status without
 * the corresponding compliance history, even if later processing fails.
 */
export async function recordTransition(
  prisma: PrismaClient,
  applicationId: string,
  fromStatus: ApplicationStatus,
  toStatus: ApplicationStatus,
  event: string,
  metadata: Record<string, unknown> = {},
  applicationData: Record<string, unknown> = {},
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.application.update({
      where: { id: applicationId },
      data: { status: toStatus, ...applicationData },
    });
    await transaction.auditTrail.create({
      data: { applicationId, fromStatus, toStatus, event, metadata },
    });
  });
}

/**
 * Runs risk review, partner verification, and final onboarding decisioning.
 * High-risk applications are rejected before a partner call; partner failures
 * become explicit, audited rejections after bounded retries are exhausted.
 */
export async function processOnboarding(
  prisma: PrismaClient,
  partner: OnboardingProcessor,
  applicationId: string,
  risk: RiskAssessment,
): Promise<OnboardingResult> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) throw new ApplicationNotFoundError(applicationId);

  if (application.status === ApplicationStatus.SUBMITTED) {
    await recordTransition(
      prisma, applicationId, ApplicationStatus.SUBMITTED, ApplicationStatus.KYC_IN_PROGRESS,
      'KYC_PROCESSING_STARTED', {}, { processingStarted: new Date() },
    );
  }
  await recordTransition(
    prisma, applicationId, ApplicationStatus.KYC_IN_PROGRESS, ApplicationStatus.RISK_REVIEW,
    'RISK_REVIEW_STARTED', { flags: risk.flags }, { riskScore: risk.score, riskFlags: risk.flags },
  );

  if (risk.score >= 70) {
    const reason = `Rejected during risk review: ${risk.explanation}`;
    await recordTransition(
      prisma, applicationId, ApplicationStatus.RISK_REVIEW, ApplicationStatus.REJECTED,
      'APPLICATION_REJECTED_HIGH_RISK', { flags: risk.flags },
      { decisionReason: reason, processingFinished: new Date() },
    );
    return { applicationId, status: ApplicationStatus.REJECTED, riskScore: risk.score, decisionReason: reason };
  }

  await recordTransition(
    prisma, applicationId, ApplicationStatus.RISK_REVIEW, ApplicationStatus.PARTNER_VERIFICATION,
    'PARTNER_VERIFICATION_STARTED',
  );

  try {
    const partnerResult = await partner.verify(applicationId);
    if (!partnerResult.verified) throw new Error('Bank partner did not verify the application');
    const reason = `Approved after risk score ${risk.score} and partner verification.`;
    await recordTransition(
      prisma, applicationId, ApplicationStatus.PARTNER_VERIFICATION, ApplicationStatus.APPROVED,
      'APPLICATION_APPROVED', { partnerReference: partnerResult.partnerReference },
      { decisionReason: reason, processingFinished: new Date() },
    );
    return {
      applicationId, status: ApplicationStatus.APPROVED, riskScore: risk.score,
      partnerReference: partnerResult.partnerReference, decisionReason: reason,
    };
  } catch (error) {
    const reason = `Rejected because bank-partner verification failed after retries: ${error instanceof Error ? error.message : 'unknown partner error'}`;
    await recordTransition(
      prisma, applicationId, ApplicationStatus.PARTNER_VERIFICATION, ApplicationStatus.REJECTED,
      'APPLICATION_REJECTED_PARTNER_FAILURE',
      { error: error instanceof Error ? error.message : 'unknown partner error' },
      { decisionReason: reason, kycFailureReason: 'BANK_PARTNER_UNAVAILABLE', processingFinished: new Date() },
    );
    return { applicationId, status: ApplicationStatus.REJECTED, riskScore: risk.score, decisionReason: reason };
  }
}

/**
 * Records a terminal KYC failure with its reason and audit event.
 * This prevents malformed or unreadable documents from remaining indefinitely in
 * KYC_IN_PROGRESS while preserving the failure reason for operations analytics.
 */
export async function recordKycFailure(
  prisma: PrismaClient,
  applicationId: string,
  reason: string,
): Promise<void> {
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) throw new ApplicationNotFoundError(applicationId);
  await recordTransition(
    prisma,
    applicationId,
    application.status,
    ApplicationStatus.KYC_FAILED,
    'KYC_PROCESSING_FAILED',
    { reason },
    { kycFailureReason: reason, processingFinished: new Date() },
  );
}