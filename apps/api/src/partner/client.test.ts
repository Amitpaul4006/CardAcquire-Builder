import { BankPartnerClient } from './client.js';

describe('BankPartnerClient', () => {
  it('retries transient partner failures with backoff', async () => {
    let calls = 0;
    const client = new BankPartnerClient(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('temporary outage');
        return { verified: true, partnerReference: 'mock-123', applicationId: 'app-123' };
      },
      undefined,
      3,
      10,
      async () => undefined,
    );
    await expect(client.verify('app-123')).resolves.toMatchObject({ verified: true });
    expect(calls).toBe(3);
  });

  it('stops retrying when the circuit opens', async () => {
    let calls = 0;
    const client = new BankPartnerClient(
      async () => {
        calls += 1;
        throw new Error('partner unavailable');
      },
      undefined,
      3,
      10,
      async () => undefined,
    );
    await expect(client.verify('app-123')).rejects.toThrow();
    expect(calls).toBe(3);
  });
});