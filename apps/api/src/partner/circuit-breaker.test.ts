import { CircuitOpenError, CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('opens after repeated failures and fails fast', async () => {
    const breaker = new CircuitBreaker(2, 1000);
    const failure = async () => {
      throw new Error('partner down');
    };
    await expect(breaker.execute(failure)).rejects.toThrow('partner down');
    await expect(breaker.execute(failure)).rejects.toThrow('partner down');
    expect(breaker.currentState).toBe('OPEN');
    await expect(breaker.execute(failure)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('half-opens after the timeout and closes after a successful probe', async () => {
    let now = 1_000;
    const realDateNow = Date.now;
    Date.now = () => now;
    try {
      const breaker = new CircuitBreaker(1, 500);
      await expect(breaker.execute(async () => { throw new Error('down'); })).rejects.toThrow('down');
      expect(breaker.currentState).toBe('OPEN');
      now += 500;
      expect(breaker.currentState).toBe('HALF_OPEN');
      await expect(breaker.execute(async () => 'recovered')).resolves.toBe('recovered');
      expect(breaker.currentState).toBe('CLOSED');
    } finally {
      Date.now = realDateNow;
    }
  });
});