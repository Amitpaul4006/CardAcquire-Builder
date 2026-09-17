import express from 'express';
import request from 'supertest';
import { createTokenPair } from './tokens.js';
import { requireAuth, requireRole } from './middleware.js';

describe('auth middleware', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  it('allows an authenticated applicant through a protected route', async () => {
    const app = express();
    app.get('/protected', requireAuth, (_request, response) => response.sendStatus(204));
    const { accessToken } = createTokenPair({ userId: 'user-123', role: 'APPLICANT' });
    await request(app).get('/protected').set('Authorization', `Bearer ${accessToken}`).expect(204);
  });

  it('rejects an applicant from an admin route', async () => {
    const app = express();
    app.get('/admin', requireAuth, requireRole('ADMIN'), (_request, response) => response.sendStatus(204));
    const { accessToken } = createTokenPair({ userId: 'user-123', role: 'APPLICANT' });
    await request(app).get('/admin').set('Authorization', `Bearer ${accessToken}`).expect(403);
  });
});