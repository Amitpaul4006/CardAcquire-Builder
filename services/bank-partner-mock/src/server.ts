import express from 'express';

const app = express();
app.use(express.json());

const port = Number(process.env.BANK_PARTNER_PORT ?? 4000);
const latencyMinMs = Number(process.env.BANK_PARTNER_LATENCY_MIN_MS ?? 100);
const latencyMaxMs = Number(process.env.BANK_PARTNER_LATENCY_MAX_MS ?? 500);
const failureRate = Number(process.env.BANK_PARTNER_FAILURE_RATE ?? 0);

/**
 * Waits for configurable random latency so callers experience a partner-like
 * network dependency instead of an unrealistically instant local response.
 */
function waitForConfiguredLatency(): Promise<void> {
  const range = Math.max(0, latencyMaxMs - latencyMinMs);
  const delay = latencyMinMs + Math.floor(Math.random() * (range + 1));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Simulates a bank-partner verification decision with injectable failures.
 * This is intentionally a mock and must never be presented as a real lender or
 * identity provider integration.
 */
app.post('/partner/verify', async (request, response) => {
  await waitForConfiguredLatency();
  if (Math.random() < failureRate) {
    response.status(503).json({ error: 'Mock bank partner unavailable' });
    return;
  }
  response.json({
    verified: true,
    partnerReference: `mock-${Date.now()}`,
    applicationId: request.body?.applicationId ?? null,
  });
});

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Mock bank partner listening on port ${port}`);
});