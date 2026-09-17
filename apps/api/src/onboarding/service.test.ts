import { ApplicationStatus } from '@prisma/client';
import { jest } from '@jest/globals';
import { processOnboarding } from './service.js';

function createPrismaMock() {
  const transitions: Array<{ status: ApplicationStatus; event: string }> = [];
  const transaction = {
    application: {
      update: jest.fn().mockImplementation(({ data }) => {
        transitions.push({ status: data.status, event: '' });
        return Promise.resolve({});
      }),
    },
    auditTrail: {
      create: jest.fn().mockImplementation(({ data }) => {
        transitions[transitions.length - 1].event = data.event;
        return Promise.resolve({});
      }),
    },
  };
  return {
    application: { findUnique: jest.fn().mockResolvedValue({ id: 'app-123', status: ApplicationStatus.SUBMITTED }) },
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    transitions,
  };
}

const cleanRisk = { score: 10, flags: [], explanation: 'No configured risk signals were detected.' };

describe('processOnboarding', () => {
  it('approves a clean application and audits every transition', async () => {
    const prisma = createPrismaMock();
    const partner = { verify: jest.fn().mockResolvedValue({ verified: true, partnerReference: 'bank-123', applicationId: 'app-123' }) };
    const result = await processOnboarding(prisma as never, partner, 'app-123', cleanRisk);

    expect(result.status).toBe(ApplicationStatus.APPROVED);
    expect(partner.verify).toHaveBeenCalledWith('app-123');
    expect(prisma.transitions.map((transition) => transition.status)).toEqual([
      ApplicationStatus.KYC_IN_PROGRESS, ApplicationStatus.RISK_REVIEW,
      ApplicationStatus.PARTNER_VERIFICATION, ApplicationStatus.APPROVED,
    ]);
    expect(prisma.transitions.map((transition) => transition.event)).toEqual([
      'KYC_PROCESSING_STARTED', 'RISK_REVIEW_STARTED',
      'PARTNER_VERIFICATION_STARTED', 'APPLICATION_APPROVED',
    ]);
  });

  it('records a rejection when the bank partner remains unavailable', async () => {
    const prisma = createPrismaMock();
    const partner = { verify: jest.fn().mockRejectedValue(new Error('circuit open')) };
    const result = await processOnboarding(prisma as never, partner, 'app-123', cleanRisk);

    expect(result.status).toBe(ApplicationStatus.REJECTED);
    expect(result.decisionReason).toContain('bank-partner verification failed');
    expect(prisma.transitions.at(-1)).toMatchObject({
      status: ApplicationStatus.REJECTED, event: 'APPLICATION_REJECTED_PARTNER_FAILURE',
    });
  });

  it('rejects high-risk applications before calling the partner', async () => {
    const prisma = createPrismaMock();
    const partner = { verify: jest.fn() };
    const result = await processOnboarding(prisma as never, partner, 'app-123', {
      score: 80, flags: ['NAME_MISMATCH'], explanation: 'Name mismatch detected.',
    });

    expect(result.status).toBe(ApplicationStatus.REJECTED);
    expect(partner.verify).not.toHaveBeenCalled();
    expect(prisma.transitions.at(-1)).toMatchObject({
      status: ApplicationStatus.REJECTED, event: 'APPLICATION_REJECTED_HIGH_RISK',
    });
  });
});