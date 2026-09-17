import { CircuitBreaker } from './circuit-breaker.js';

export interface PartnerVerificationResponse {
  verified: boolean;
  partnerReference: string;
  applicationId: string | null;
}

export type PartnerTransport = (
  applicationId: string,
) => Promise<PartnerVerificationResponse>;

/**
 * Calls the mock bank partner with bounded exponential-backoff retries and a
 * circuit breaker. Retries absorb transient 5xx/network failures; the breaker
 * prevents sustained outages from consuming worker capacity indefinitely.
 */
export class BankPartnerClient {
  constructor(
    private readonly transport: PartnerTransport,
    private readonly breaker = new CircuitBreaker(),
    private readonly maxAttempts = 3,
    private readonly baseDelayMs = 100,
    private readonly sleep: (delayMs: number) => Promise<void> = (delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)),
  ) {}

  /**
   * Verifies an application and returns the partner response or the final error.
   * The retry count is deliberately bounded so a bank outage cannot stall a job
   * forever; BullMQ remains responsible for the outer job retry policy.
   */
  async verify(applicationId: string): Promise<PartnerVerificationResponse> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        return await this.breaker.execute(() => this.transport(applicationId));
      } catch (error) {
        lastError = error;
        if (attempt === this.maxAttempts) {
          break;
        }
        await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Bank partner verification failed');
  }
}

/**
 * Creates the HTTP transport for the standalone mock bank-partner service.
 * Non-success responses become errors so the client can retry and open its breaker.
 */
export function createHttpPartnerTransport(baseUrl: string): PartnerTransport {
  return async (applicationId) => {
    const response = await fetch(`${baseUrl}/partner/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId }),
    });
    if (!response.ok) {
      throw new Error(`Bank partner returned HTTP ${response.status}`);
    }
    return (await response.json()) as PartnerVerificationResponse;
  };
}