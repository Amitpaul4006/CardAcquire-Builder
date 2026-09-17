export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitOpenError extends Error {
  constructor() {
    super('Bank partner circuit is open');
    this.name = 'CircuitOpenError';
  }
}

/**
 * Protects the application worker from repeatedly calling an unhealthy partner.
 * CLOSED permits traffic, OPEN fails fast after repeated failures, and HALF_OPEN
 * permits one probe after the reset timeout to test recovery.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenProbeInFlight = false;

  constructor(
    private readonly failureThreshold = 3,
    private readonly resetTimeoutMs = 10_000,
  ) {}

  get currentState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() - this.openedAt >= this.resetTimeoutMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  /**
   * Executes one partner call if the circuit permits it and records its outcome.
   * The caller owns retry timing; this class owns availability state transitions.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.currentState;
    if (state === 'OPEN' || (state === 'HALF_OPEN' && this.halfOpenProbeInFlight)) {
      throw new CircuitOpenError();
    }
    if (state === 'HALF_OPEN') {
      this.halfOpenProbeInFlight = true;
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    } finally {
      this.halfOpenProbeInFlight = false;
    }
  }

  private recordSuccess(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.openedAt = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }
}