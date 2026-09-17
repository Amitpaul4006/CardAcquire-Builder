import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

export interface ApplicationJob {
  applicationId: string;
}

/**
 * Defines the API-to-worker handoff so the HTTP layer stays independent of BullMQ.
 * The producer uses the application ID as the job ID, making queue insertion
 * idempotent when a client retries a submission or the API retries an enqueue.
 */
export interface ApplicationQueue {
  enqueue(job: ApplicationJob): Promise<void>;
}

export const APPLICATION_QUEUE_NAME = 'application-processing';
export const DEAD_LETTER_QUEUE_NAME = 'application-processing-dead-letter';

export const applicationJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: false,
};

/**
 * Creates the Redis connection used by BullMQ queues and workers.
 * Workers wait through broker interruptions instead of failing individual jobs.
 */
export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

/**
 * Adds application processing jobs to the durable Redis-backed queue.
 * BullMQ's deterministic job ID prevents the same application from entering
 * the processing pipeline twice and consuming duplicate KYC capacity.
 */
export class BullMqApplicationQueue implements ApplicationQueue {
  constructor(private readonly queue: Queue<ApplicationJob>) {}

  async enqueue(job: ApplicationJob): Promise<void> {
    await this.queue.add('process-application', job, {
      ...applicationJobOptions,
      jobId: job.applicationId,
    });
  }
}

/**
 * Builds the application queue and producer wrapper from a Redis URL.
 * The returned connection should be closed during graceful API shutdown.
 */
export function createApplicationQueue(redisUrl: string) {
  const connection = createRedisConnection(redisUrl);
  const queue = new Queue<ApplicationJob>(APPLICATION_QUEUE_NAME, { connection });
  return { connection, queue, producer: new BullMqApplicationQueue(queue) };
}

export const placeholderApplicationQueue: ApplicationQueue = {
  async enqueue(): Promise<void> {
    throw new Error('Application queue is not configured');
  },
};