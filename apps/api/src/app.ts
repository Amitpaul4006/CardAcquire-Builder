import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { loginUser, registerApplicant } from './auth/service.js';
import { requireAuth, requireRole } from './auth/middleware.js';
import { ApplicationConflictError, ApplicationQueueError, submitApplication } from './applications/service.js';
import { placeholderApplicationQueue, type ApplicationQueue } from './applications/queue.js';
import { getAnalyticsSummary } from './analytics/service.js';
import { answerAssistant } from './assistant/service.js';

export function createApp(prisma: PrismaClient, queue: ApplicationQueue = placeholderApplicationQueue) {
  const app = express();
  const uploadDirectory = path.resolve(process.env.UPLOAD_DIRECTORY ?? 'uploads');
  fs.mkdirSync(uploadDirectory, { recursive: true });
  const upload = multer({
    dest: uploadDirectory,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
    },
  });
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());
  app.use('/uploads', express.static(uploadDirectory));
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts; try again later' },
  });

  app.post('/auth/signup', authLimiter, async (request, response) => {
    try {
      const result = await registerApplicant(prisma, request.body);
      response.status(201).json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        response.status(409).json({ error: 'An account already exists for this email' });
        return;
      }
      response.status(400).json({ error: 'Invalid registration details' });
    }
  });

  app.post('/auth/login', authLimiter, async (request, response) => {
    try {
      response.json(await loginUser(prisma, request.body));
    } catch {
      response.status(401).json({ error: 'Invalid email or password' });
    }
  });

  app.get('/protected', requireAuth, (request, response) => {
    response.json({ userId: request.auth?.userId, role: request.auth?.role });
  });

  app.post('/assistant/chat', requireAuth, async (request, response) => {
    const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
    if (!message || message.length > 500) {
      response.status(400).json({ error: 'Message must be between 1 and 500 characters' });
      return;
    }
    const applicationId = typeof request.body?.applicationId === 'string' ? request.body.applicationId : undefined;
    if (applicationId) {
      const application = await prisma.application.findUnique({ where: { id: applicationId } });
      if (!application || (request.auth?.role !== 'ADMIN' && application.userId !== request.auth?.userId)) {
        response.status(404).json({ error: 'Application not found' });
        return;
      }
    }
    response.json(await answerAssistant(prisma, message, applicationId));
  });

  app.get('/admin/protected', requireAuth, requireRole('ADMIN'), (_request, response) => {
    response.json({ ok: true });
  });

  app.get('/admin/analytics', requireAuth, requireRole('ADMIN'), async (_request, response) => {
    try {
      response.json(await getAnalyticsSummary(prisma));
    } catch {
      response.status(500).json({ error: 'Unable to load analytics' });
    }
  });

  app.post('/applications', requireAuth, upload.single('idDocument'), async (request, response) => {
    try {
      const input = {
        ...request.body,
        idDocumentUrl: request.file
          ? `/uploads/${request.file.filename}`
          : request.body.idDocumentUrl,
      };
      const result = await submitApplication(
        prisma,
        queue,
        request.auth!.userId,
        request.ip,
        input,
      );
      response.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof ApplicationConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      if (error instanceof ApplicationQueueError) {
        response.status(503).json({ error: error.message, applicationId: error.applicationId });
        return;
      }
      if (error instanceof Error && error.name === 'ZodError') {
        response.status(400).json({ error: 'Invalid application details' });
        return;
      }
      response.status(500).json({ error: 'Unable to submit application' });
    }
  });

  app.get('/applications/:id', requireAuth, async (request, response) => {
    const applicationId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application || (request.auth?.role !== 'ADMIN' && application.userId !== request.auth?.userId)) {
      response.status(404).json({ error: 'Application not found' });
      return;
    }
    response.json({ application });
  });

  app.get('/applications/:id/audit', requireAuth, async (request, response) => {
    const applicationId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application || (request.auth?.role !== 'ADMIN' && application.userId !== request.auth?.userId)) {
      response.status(404).json({ error: 'Application not found' });
      return;
    }
    const auditTrail = await prisma.auditTrail.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'asc' },
    });
    response.json({ auditTrail });
  });

  return app;
}