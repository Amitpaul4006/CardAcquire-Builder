import { ApplicationStatus } from '@prisma/client';
import { jest } from '@jest/globals';
import { submitApplication } from './service.js';

function createPrismaMock() {
  const application = {
    id: 'application-123',
    userId: 'user-123',
    dedupeKey: 'dedupe-123',
    applicantName: 'Amit Paul',
    dateOfBirth: new Date('1990-01-01'),
    status: ApplicationStatus.SUBMITTED,
  };
  const transaction = {
    application: { create: jest.fn().mockResolvedValue(application) },
    auditTrail: { create: jest.fn().mockResolvedValue({}) },
  };
  return {
    application: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    transaction,
    applicationRecord: application,
  };
}

describe('submitApplication', () => {
  it('creates one application, writes the initial audit event, and enqueues KYC', async () => {
    const prisma = createPrismaMock();
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const result = await submitApplication(
      prisma as never,
      queue,
      'user-123',
      '127.0.0.1',
      {
        dedupeKey: 'dedupe-123',
        applicantName: 'Amit Paul',
        dateOfBirth: '1990-01-01',
      },
    );

    expect(result.duplicate).toBe(false);
    expect(prisma.transaction.auditTrail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: 'application-123',
        toStatus: ApplicationStatus.SUBMITTED,
      }),
    });
    expect(queue.enqueue).toHaveBeenCalledWith({ applicationId: 'application-123' });
  });

  it('returns the existing application without enqueuing a duplicate job', async () => {
    const prisma = createPrismaMock();
    prisma.application.findUnique.mockResolvedValue(prisma.applicationRecord);
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const result = await submitApplication(
      prisma as never,
      queue,
      'user-123',
      '127.0.0.1',
      {
        dedupeKey: 'dedupe-123',
        applicantName: 'Amit Paul',
        dateOfBirth: '1990-01-01',
      },
    );

    expect(result.duplicate).toBe(true);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid application details before touching the database', async () => {
    const prisma = createPrismaMock();
    const queue = { enqueue: jest.fn() };

    await expect(
      submitApplication(prisma as never, queue, 'user-123', '127.0.0.1', {
        dedupeKey: '',
        applicantName: 'A',
        dateOfBirth: 'not-a-date',
      }),
    ).rejects.toThrow();
    expect(prisma.application.findUnique).not.toHaveBeenCalled();
  });
});