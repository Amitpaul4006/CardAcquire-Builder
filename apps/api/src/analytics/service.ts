import { ApplicationStatus, type PrismaClient } from '@prisma/client';

export interface AnalyticsSummary {
  totalApplications: number;
  approvalRate: number;
  rejectionRate: number;
  funnel: Array<{ stage: string; count: number }>;
  riskDistribution: Array<{ bucket: string; count: number }>;
  averageProcessingTimeMs: number;
  kycFailureReasons: Array<{ reason: string; count: number }>;
}

/**
 * Aggregates operational funnel metrics without returning applicant PII.
 * Admins use this view to find conversion drop-off, KYC failure patterns, and
 * processing latency without querying raw identity or document fields.
 */
export async function getAnalyticsSummary(prisma: PrismaClient): Promise<AnalyticsSummary> {
  const applications = await prisma.application.findMany({
    select: {
      status: true,
      riskScore: true,
      kycFailureReason: true,
      processingStarted: true,
      processingFinished: true,
    },
  });
  const totalApplications = applications.length;
  const approved = applications.filter((application) => application.status === ApplicationStatus.APPROVED).length;
  const rejected = applications.filter((application) => application.status === ApplicationStatus.REJECTED).length;
  const completed = applications.filter((application) => application.processingStarted && application.processingFinished);
  const processingTotalMs = completed.reduce(
    (total, application) => total + application.processingFinished!.getTime() - application.processingStarted!.getTime(),
    0,
  );
  const riskBuckets = { '0-29': 0, '30-59': 0, '60-79': 0, '80-100': 0, UNKNOWN: 0 };
  const failureReasons = new Map<string, number>();
  for (const application of applications) {
    if (application.riskScore === null) riskBuckets.UNKNOWN += 1;
    else if (application.riskScore < 30) riskBuckets['0-29'] += 1;
    else if (application.riskScore < 60) riskBuckets['30-59'] += 1;
    else if (application.riskScore < 80) riskBuckets['60-79'] += 1;
    else riskBuckets['80-100'] += 1;
    if (application.kycFailureReason) {
      failureReasons.set(application.kycFailureReason, (failureReasons.get(application.kycFailureReason) ?? 0) + 1);
    }
  }
  return {
    totalApplications,
    approvalRate: totalApplications ? Math.round((approved / totalApplications) * 100) : 0,
    rejectionRate: totalApplications ? Math.round((rejected / totalApplications) * 100) : 0,
    funnel: [
      { stage: 'Submitted', count: totalApplications },
      { stage: 'KYC', count: applications.filter((application) => application.status !== ApplicationStatus.SUBMITTED).length },
      { stage: 'Risk review', count: applications.filter((application) => [ApplicationStatus.RISK_REVIEW, ApplicationStatus.PARTNER_VERIFICATION, ApplicationStatus.APPROVED, ApplicationStatus.REJECTED].includes(application.status)).length },
      { stage: 'Decision', count: approved + rejected },
    ],
    riskDistribution: Object.entries(riskBuckets).map(([bucket, count]) => ({ bucket, count })),
    averageProcessingTimeMs: completed.length ? Math.round(processingTotalMs / completed.length) : 0,
    kycFailureReasons: [...failureReasons.entries()].map(([reason, count]) => ({ reason, count })),
  };
}