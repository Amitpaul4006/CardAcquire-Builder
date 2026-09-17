# CardAcquire

CardAcquire is a deliberately scaled-down, architecturally honest credit-card acquisition pipeline. It demonstrates application intake, asynchronous KYC processing, risk decisions, partner reliability, onboarding, auditability, and operational analytics without pretending to integrate with a real bank or identity vendor.

## Current status

Phase 14 is complete: the live worker path now connects BullMQ to KYC, risk scoring, bank-partner verification, and onboarding. The Render Blueprint now includes API, KYC web service, processing worker, and mock partner; this README documents the presentation model, runtime commands, service boundaries, and audit inspection flow.

## Repository layout

```text
apps/
  api/                  TypeScript + Express API (future phases)
  web/                  React applicant and admin experience (future phases)
services/
  kyc-worker/           Python KYC and queue consumer service (future phases)
infra/
  terraform/            AWS interview-prep infrastructure (future phase)
docs/                   Architecture and operational notes
```

The boundaries match the eventual runtime architecture. Keeping the API, frontend, worker, and infrastructure in separate directories makes ownership, deployment, and failure behavior easier to explain without prematurely coupling the implementation.

## Local prerequisites

- Docker Engine with Docker Compose v2
- Node.js 20 or newer for the JavaScript workspaces
- Python 3.11 or newer for the worker in later phases

## Start local infrastructure

```bash
cp .env.example .env
docker compose up -d postgres redis
docker compose ps
```

The application containers are included as Compose placeholders and will be wired to real commands in their respective phases. Do not add production credentials to `.env`; use local values only.

## Database schema and migrations

The API owns the Prisma schema at `apps/api/prisma/schema.prisma`. Run these commands from `apps/api` after installing dependencies and starting PostgreSQL:

```bash
npm install
npx prisma validate
npx prisma migrate dev
```

The `dedupe_key` has a database-level unique constraint so retries cannot create a second application. `audit_trail` is append-only: each state transition inserts a new record rather than overwriting history, which supports KYC investigations and compliance review.

Run the API unit and route tests from `apps/api` with `npm test`. The application submission tests use an in-memory Prisma-shaped mock for deterministic idempotency and validation checks; a live PostgreSQL integration test will be added when the runtime services are wired into the queue phase.

Run the queue worker locally with `npm run worker --workspace=@cardacquire/api` after Redis is available. The API uses the `application-processing` queue; jobs that fail three attempts are copied to `application-processing-dead-letter` for inspection or replay.

Run KYC and risk tests with `PYTHONPATH=services/kyc-worker services/kyc-worker/.venv/bin/python -m pytest -q services/kyc-worker/tests`. The FastAPI endpoints are `POST /kyc/extract` and `POST /risk/score`. Set `ANTHROPIC_API_KEY` only when structured extraction or optional risk reasoning is needed; deterministic rules remain local and testable.

Run onboarding tests with `npm test --workspace=@cardacquire/api`. The happy path, high-risk rejection, and forced partner-failure path verify that each status transition and its audit event are written together.

Inspect an application's audit history with `GET /applications/:id/audit` using the same applicant or admin Bearer token. This is the operational view of the append-only compliance trail behind the status tracker.

Run the applicant frontend with `npm run dev --workspace=@cardacquire/web`. Set `VITE_API_BASE_URL` to the API URL. The frontend uses session storage for the demo access token and submits identity documents as multipart form data.

The analytics endpoint is `GET /admin/analytics` and requires an `ADMIN` access token. The dashboard uses Recharts and never receives applicant identity fields.

## Team-lead walkthrough

The browser is only the applicant/admin presentation layer. The backend is observable through API responses, service logs, PostgreSQL rows, Redis queue state, and the audit endpoint. The Python service owns OCR, document sanity checks, structured extraction, and deterministic risk scoring; the Node worker owns orchestration and failure semantics; the mock partner demonstrates retry and circuit-breaker behavior; Terraform describes the disposable AWS topology; Render/Vercel/Neon/Upstash describe the public deployment path.

The agentic AI boundary is deliberately controlled rather than hidden: Anthropic is called only when `KYC_USE_LLM=true` or a request sets `use_llm=true`. The extraction prompt requires strict JSON and null for unreadable fields. Risk rules calculate the authoritative score and flags; the LLM may explain those flags but cannot change the score or approve an applicant. This keeps AI useful for unstructured-document interpretation and operator reasoning while deterministic rules remain auditable.

## Complete local run

```bash
# Terminal 1: infrastructure
newgrp docker -c 'docker compose up -d postgres redis'

# Terminal 2: database
export DATABASE_URL='postgresql://cardacquire:cardacquire_local_only@localhost:5432/cardacquire'
npm run prisma:migrate:dev --workspace=@cardacquire/api

# Terminal 3: API
export DATABASE_URL='postgresql://cardacquire:cardacquire_local_only@localhost:5432/cardacquire'
export REDIS_URL='redis://localhost:6379'
export JWT_ACCESS_SECRET='local-demo-access-secret'
export JWT_REFRESH_SECRET='local-demo-refresh-secret'
export KYC_SERVICE_URL='http://localhost:8000'
export BANK_PARTNER_URL='http://localhost:4000'
npm run dev --workspace=@cardacquire/api

# Terminal 4: KYC service with Tesseract
newgrp docker -c 'docker compose up -d worker'

# Terminal 5: mock partner
npm run dev --workspace=@cardacquire/bank-partner-mock

# Terminal 6: BullMQ worker
export DATABASE_URL='postgresql://cardacquire:cardacquire_local_only@localhost:5432/cardacquire'
export REDIS_URL='redis://localhost:6379'
export JWT_ACCESS_SECRET='local-demo-access-secret'
export JWT_REFRESH_SECRET='local-demo-refresh-secret'
export KYC_SERVICE_URL='http://localhost:8000'
export BANK_PARTNER_URL='http://localhost:4000'
npm run worker --workspace=@cardacquire/api

# Terminal 7: frontend
export VITE_API_BASE_URL='http://localhost:3000'
npm run dev --workspace=@cardacquire/web -- --host 0.0.0.0
```

Open `http://localhost:5173`. Use the browser to sign up, submit a readable ID image, and watch the tracker poll the API. For backend inspection, use `curl http://localhost:3000/health`, `curl http://localhost:8000/health`, `curl http://localhost:4000/health`, query `GET /applications/:id`, query `GET /applications/:id/audit`, and inspect `docker compose logs -f worker`.

## Component map

| Component | What to inspect | Business purpose |
| --- | --- | --- |
| React/Vite | `apps/web/src/App.tsx` | Applicant intake, status visibility, admin metrics |
| Express API | `apps/api/src/app.ts` | Authenticated boundary, validation, upload, ownership |
| Prisma/Postgres | `apps/api/prisma` | Durable applications, users, audit history |
| BullMQ/Redis | `apps/api/src/applications/queue.ts` | Async handoff, retries, dead-letter queue |
| Node worker | `apps/api/src/queue/worker.ts` | Orchestrates KYC, risk, partner, onboarding |
| FastAPI KYC | `services/kyc-worker/app` | OCR, extraction, fraud signals, risk score |
| Mock partner | `services/bank-partner-mock` | Latency/failure simulation and resilience testing |
| Terraform | `infra/terraform` | Disposable AWS interview architecture |

Validate infrastructure from `infra/terraform` with `terraform init`, `terraform fmt -check`, and `terraform validate`. Apply it only for a deliberate demo and run `terraform destroy` afterward.

## Public deployment

Phase 13 deployment configuration targets Render for the API and Python KYC service, Vercel for the React frontend, Neon for PostgreSQL, and Upstash for Redis. The Blueprint is in `render.yaml`; Vercel settings are in `apps/web/vercel.json`; copy `.env.production.example` into your provider dashboards rather than committing secrets. Neon must use its SSL connection string and Upstash must use its TLS `rediss://` URL. Set Render's `FRONTEND_ORIGIN` to the final Vercel URL and Vercel's `VITE_API_BASE_URL` to the Render API URL.

Render's background-worker availability and free-tier limits can change. If a free Render worker is unavailable, deploy the Python service as a separately managed Render web service or use another free worker host; the API, Neon, Upstash, and Vercel boundaries remain the same. Render's ephemeral filesystem means local document uploads are demo-only; durable public document storage belongs in the S3 phase.

Start the mock bank partner with `npm run dev --workspace=@cardacquire/bank-partner-mock`. Configure latency and failure injection through `BANK_PARTNER_LATENCY_MIN_MS`, `BANK_PARTNER_LATENCY_MAX_MS`, and `BANK_PARTNER_FAILURE_RATE`. The API resilience tests cover retry behavior and circuit CLOSED, OPEN, HALF_OPEN, and recovered states.

## Authentication configuration

Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env` to long random values before starting the API. Access tokens expire after 15 minutes; refresh tokens expire after 7 days. The refresh-token verification boundary is present for the later token-rotation endpoint, while the current phase establishes signup, login, authentication middleware, role enforcement, and rate limiting.

## Planned phases

The implementation follows the numbered phases in `cardacquireAmazon-copilot-build-prompt.md`. Each phase adds its own tests and stops for review before the next phase begins.

1. Repository scaffolding
2. PostgreSQL schema and Prisma migrations
3. JWT authentication, roles, and rate limiting
4. Idempotent application submission API
5. BullMQ queue and worker skeleton
6. OCR and LLM-assisted KYC service
7. Risk scoring
8. Mock bank partner, retries, and circuit breaker
9. Onboarding decisions and audit trail
10. Applicant frontend
11. Admin analytics dashboard
12. Terraform AWS architecture
13. Public deployment using Render, Vercel, Neon, and Upstash
14. Documentation and polish

## Scope reminders

The first implementation is single-market. The schema will leave room for future market and currency support, but localization is intentionally out of scope. Bank and KYC integrations remain mock/demo integrations. The AWS environment is an interview-preparation artifact to tear down after demonstrations; the separate free-tier deployment is the long-lived public demo.