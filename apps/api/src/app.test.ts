import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from './app.js';
import { createTokenPair } from './auth/tokens.js';
import type { ApplicationQueue } from './applications/queue.js';

describe('application submission endpoint', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  function createDependencies() {
    const application = {
      id: 'application-123',
      userId: 'user-123',
      dedupeKey: 'dedupe-123',
      applicantName: 'Amit Paul',
      dateOfBirth: new Date('1990-01-01'),
      status: 'SUBMITTED',
    };
    const transaction = {
      application: { create: jest.fn().mockResolvedValue(application) },
      auditTrail: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      application: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const queue: ApplicationQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    return { application, prisma, queue };
  }

  it('requires authentication', async () => {
    const { prisma, queue } = createDependencies();
    await request(createApp(prisma as never, queue)).post('/applications').expect(401);
  });

  it('returns 201 for a valid authenticated submission', async () => {
    const { prisma, queue } = createDependencies();
    const { accessToken } = createTokenPair({ userId: 'user-123', role: 'APPLICANT' });

    await request(createApp(prisma as never, queue))
      .post('/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        dedupeKey: 'dedupe-123',
        applicantName: 'Amit Paul',
        dateOfBirth: '1990-01-01',
      })
      .expect(201);
  });

  it('returns 400 for invalid application details', async () => {
    const { prisma, queue } = createDependencies();
    const { accessToken } = createTokenPair({ userId: 'user-123', role: 'APPLICANT' });

    await request(createApp(prisma as never, queue))
      .post('/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ dedupeKey: '', applicantName: 'A', dateOfBirth: 'invalid' })
      .expect(400);
  });
});