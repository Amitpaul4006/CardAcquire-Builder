import { ApplicationStatus } from '@prisma/client';
import { jest } from '@jest/globals';
import { getAnalyticsSummary } from './service.js';

describe('getAnalyticsSummary', () => {
  it('computes funnel, rates, risk buckets, latency, and failure reasons', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const finish = new Date('2026-01-01T00:01:00Z');
    const prisma = {
      application: {
        findMany: jest.fn().mockResolvedValue([
          { status: ApplicationStatus.APPROVED, riskScore: 10, kycFailureReason: null, processingStarted: start, processingFinished: finish },
          { status: ApplicationStatus.REJECTED, riskScore: 85, kycFailureReason: 'BANK_PARTNER_UNAVAILABLE', processingStarted: start, processingFinished: finish },
          { status: ApplicationStatus.SUBMITTED, riskScore: null, kycFailureReason: null, processingStarted: null, processingFinished: null },
        ]),
      },
    };
    const summary = await getAnalyticsSummary(prisma as never);
    expect(summary.totalApplications).toBe(3);
    expect(summary.approvalRate).toBe(33);
    expect(summary.rejectionRate).toBe(33);
    expect(summary.averageProcessingTimeMs).toBe(60000);
    expect(summary.kycFailureReasons).toEqual([{ reason: 'BANK_PARTNER_UNAVAILABLE', count: 1 }]);
    expect(summary.riskDistribution).toContainEqual({ bucket: '0-29', count: 1 });
    expect(summary.riskDistribution).toContainEqual({ bucket: '80-100', count: 1 });
  });
});