import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { createApplicationQueue } from './applications/queue.js';

const prisma = new PrismaClient();
const applicationQueue = createApplicationQueue(process.env.REDIS_URL ?? 'redis://localhost:6379');
const app = createApp(prisma, applicationQueue.producer);
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);

app.listen(port, () => {
  console.log(`CardAcquire API listening on port ${port}`);
});