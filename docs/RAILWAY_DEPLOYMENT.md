# Railway Deployment Guide

Railway is suitable for a demo deployment, but its free/trial usage is credit-based and may require billing verification. Set spending limits in Railway before deploying.

## Service layout

Create four Railway services from the same repository:

| Service | Root directory | Build | Start |
| --- | --- | --- | --- |
| API | `/` | `npm install && npm run prisma:generate --workspace=@cardacquire/api && npm run build --workspace=@cardacquire/api` | `npm run start --workspace=@cardacquire/api` |
| Processing worker | `/` | `npm install && npm run prisma:generate --workspace=@cardacquire/api && npm run build --workspace=@cardacquire/api` | `npm run worker --workspace=@cardacquire/api` |
| KYC service | `/services/kyc-worker` | Dockerfile detected automatically | Dockerfile command |
| Mock partner | `/` | `npm install` | `npm run dev --workspace=@cardacquire/bank-partner-mock` |

For the KYC service, set the service root directory exactly to `/services/kyc-worker`. This lets Railway find the Python Dockerfile and install Tesseract.

## API variables

Add these to the API service before deploying. Railway's pre-deploy migration cannot run until `DATABASE_URL` exists.

```env
DATABASE_URL=<rotated Neon pooled connection string>
REDIS_URL=<rotated Upstash rediss URL>
JWT_ACCESS_SECRET=<long random secret>
JWT_REFRESH_SECRET=<long random secret>
PORT=3000
FRONTEND_ORIGIN=<Vercel URL, added after Vercel deployment>
KYC_SERVICE_URL=<KYC Railway public URL>
BANK_PARTNER_URL=<mock partner Railway public URL>
ANTHROPIC_API_KEY=<Anthropic key entered privately in Railway>
ANTHROPIC_MODEL=claude-3-5-haiku-latest
ASSISTANT_USE_LLM=true
UPLOAD_DIRECTORY=/tmp/cardacquire-uploads
```

Use the Neon pooled SSL URL and Upstash TLS URL. Do not use a local `localhost` URL and do not use Upstash's REST URL for `REDIS_URL`.

## API commands

```text
Build: npm install && npm run prisma:generate --workspace=@cardacquire/api && npm run build --workspace=@cardacquire/api
Pre-deploy: npm run prisma:migrate:deploy --workspace=@cardacquire/api
Start: npm run start --workspace=@cardacquire/api
```

The API uses Railway's `PORT` automatically.

## Processing worker variables

The worker needs the same database and Redis values plus service URLs:

```env
DATABASE_URL=<same rotated Neon URL>
REDIS_URL=<same rotated Upstash rediss URL>
KYC_SERVICE_URL=<KYC Railway public URL>
BANK_PARTNER_URL=<mock partner Railway public URL>
JWT_ACCESS_SECRET=<same API secret>
JWT_REFRESH_SECRET=<same API secret>
ANTHROPIC_API_KEY=<same private Anthropic key if AI is enabled>
KYC_USE_LLM=true
```

Start command:

```text
npm run worker --workspace=@cardacquire/api
```

## KYC service

Set root directory to `/services/kyc-worker`.

The Dockerfile installs Tesseract and runs FastAPI. Railway supplies `PORT`; if the Dockerfile's fixed port is not detected, set the service start command to:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Variables:

```env
PORT=8000
ANTHROPIC_API_KEY=<same private Anthropic key if AI is enabled>
ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

## Mock partner

Set root directory to `/` and start command:

```text
npm run dev --workspace=@cardacquire/bank-partner-mock
```

Variables:

```env
PORT=4000
BANK_PARTNER_LATENCY_MIN_MS=100
BANK_PARTNER_LATENCY_MAX_MS=500
BANK_PARTNER_FAILURE_RATE=0
```

## Public URLs and networking

After each web service deploys, copy its public URL into the API and worker variables. Railway private service names are not automatically valid HTTP hostnames unless Railway private networking is configured; use public service URLs first for a simple demo.

The final frontend deployment should set:

```env
VITE_API_BASE_URL=https://<railway-api-domain>
```

Then update the API:

```env
FRONTEND_ORIGIN=https://<vercel-frontend-domain>
```

## Smoke tests

```bash
curl https://<railway-api-domain>/health
curl https://<railway-kyc-domain>/health
curl https://<railway-partner-domain>/health
```

After Vercel is deployed, test signup, upload a readable ID image, wait for the application tracker to move through KYC/risk/partner verification, and inspect:

```text
GET /applications/:id
GET /applications/:id/audit
```

## Security

Rotate the Neon, Upstash, and Anthropic credentials that were exposed during setup. Enter replacement values directly into Railway's Variables UI. Never commit them, paste them into chat, or place them in this repository.
