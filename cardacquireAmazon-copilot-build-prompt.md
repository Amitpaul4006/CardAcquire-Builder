# Copilot Build Prompt — CardAcquire (Cobranded Credit Card Acquisition Pipeline)

> Copy everything below the line into VS Code Copilot Chat (Agent/Edit mode) as your opening prompt. Keep it as one message so Copilot has full context before writing any code.

---

## Who I am and why this project exists

I'm a Senior Full-Stack Engineer (6 YoE, Node.js/Python/React) building a portfolio project to showcase on LinkedIn. I was contacted by an Amazon recruiter for an SDE role on Amazon's ICCS (International Cobranded Credit Cards) Acquisition team. That team owns the end-to-end tech for acquiring cobranded credit card customers in the UK, Japan, and Germany — covering discovery, sign-up, KYC verification with bank partners, and onboarding into internal systems, built on distributed systems that are scalable, fault-tolerant, and easy to manage.

I want to build a scaled-down but architecturally honest version of that kind of system, called **CardAcquire**, to demonstrate I understand this problem space — not a toy CRUD app. I will write about this build publicly, so the codebase needs to be genuinely explainable to a stranger just by reading it. I also intend to deploy it publicly on free-tier hosting so it's accessible to anyone I share it with.

## How I want you (Copilot) to work with me

This is the most important section — follow it strictly:

1. **Before writing any code for a function, module, or component, briefly explain to me**: what it does, how it works (the mechanism/approach), and why it's needed for this business case (tie it back to real card-acquisition/KYC concerns — fraud, compliance, conversion drop-off, partner integration reliability, etc.). Keep this explanation short (3-6 sentences) — not a lecture, just enough that I fully understand what's about to be built before it exists in the repo.
2. **Every non-trivial function, class, and component needs a descriptive comment block above it** (purpose, inputs/outputs, and — where relevant — the business reason it exists) so that a new engineer could understand the entire system by reading the code and comments alone, without needing this prompt or external docs.
3. Build **incrementally, in the phases listed below, in order**. After each phase, stop and tell me what was built, how to run/test it, and wait for me to say "continue" before moving to the next phase. Do not jump ahead or build multiple phases silently in one shot.
4. **Do not silently make architectural decisions I haven't approved.** If something in this prompt is ambiguous or you see a better approach, ask me or state your assumption explicitly before proceeding, rather than guessing and moving on.
5. Write **test cases alongside the code that exercises them**, not as an afterthought at the end — each phase should include its own tests before we move to the next phase.
6. I do not want a lecture-style back-and-forth on every single line — batch your explanation per function/module, not per line of code.

## What we're building — the pipeline

```
Applicant → React form (application + ID doc upload)
         → Node/Express API (idempotent submission, JWT-authenticated, saves to DB, enqueues job)
         → Redis-backed queue
         → AI KYC worker service (OCR + LLM field extraction, document sanity checks)
         → Risk scoring (rule-based + LLM reasoning over red flags)
         → Mock bank-partner API (simulated latency/failures, called via retry + circuit breaker)
         → Onboarding record (approve/reject decision + audit trail)
         → Admin dashboard (analytics: funnel drop-off, approval rate, risk distribution, processing time)
```

Seven stages end to end. Every stage should map to something an interviewer could ask "why did you build it this way" about, and I should have a real answer grounded in the KYC/fintech domain (not just "because the tutorial did it this way").

## Scope for this build — do not exceed this

**In scope:**
- Single market only (no UK/JP/DE localization — just note in a comment/README that the schema is designed to extend to multiple markets/currencies later)
- Application form with basic validation
- Idempotent submission endpoint (dedupe key so a retried request doesn't create a duplicate application)
- Async processing via a Redis-backed queue (BullMQ), with a dead-letter queue for jobs that fail repeatedly
- AI KYC service: OCR + LLM-based extraction of name/DOB/ID number from an uploaded document image, plus basic fraud-signal checks (blurry image, mismatched name against form, duplicate application velocity from same device/IP)
- Rule-based + LLM-assisted risk scoring producing a score and a set of flags
- A mock bank-partner API you build yourself, with configurable random latency and failure injection
- Retry logic with backoff and a circuit breaker around the mock bank-partner call
- Postgres persistence with an audit trail table (every state transition of an application is logged, not just the final state — this matters because real KYC systems must be auditable)
- **Real JWT-based authentication with two roles**: applicant (can submit/view own application) and admin (can view all applications + dashboard). Explain your token strategy (access/refresh tokens, expiry) as you build it.
- **Basic rate limiting middleware** on public-facing endpoints (e.g. `express-rate-limit`), explained in terms of why an acquisition funnel needs it (bot/abuse protection on a form that leads into paid KYC checks)
- **Admin analytics dashboard** (React + a charting library like Recharts): approval vs. rejection rate, funnel drop-off by stage, risk score distribution, average processing time, KYC failure reasons breakdown. This should look like something worth screenshotting for LinkedIn, not a raw data table.
- **Infrastructure as Code (Terraform)** provisioning a realistic (if minimal) cloud architecture: VPC, ECS/Fargate or EC2 for the API/worker, RDS for Postgres, ElastiCache for Redis, S3 for document storage, IAM roles scoped per service. Include a written note on where a managed WAF (e.g. AWS WAF) would sit in front of this in a real deployment, and why — you don't need to provision it live, but the reasoning should be documented. This is a learning/interview-prep artifact — spin it up for a demo/screenshot, then tear it down; it's not meant to stay live.
- **A separate, actually-live public deployment on free-tier PaaS**, distinct from the Terraform/AWS exercise above, so I have a real shareable link: e.g. Render or Railway for the Node API + Python worker, Vercel or Netlify for the React frontend, Neon or Supabase for Postgres, Upstash for Redis. This one should stay up. Pick a concrete combination and explain the choice.
- Unit tests for business logic (risk scoring, idempotency check, circuit breaker state transitions, auth token validation) and integration tests for the API endpoints and queue consumer
- A clear README explaining architecture, how to run locally, how to run tests, and how the Terraform maps to the architecture diagram

**Explicitly out of scope — do not build these, just leave short comments noting them as future extensions where relevant:**
- Real bank/KYC vendor integration (mock only, clearly labeled as mock in code and README)
- Multi-market localization/currency handling
- Keeping the Terraform/AWS environment live 24/7 (write it to be runnable and correct, demo it once, then tear it down for cost reasons — note this tradeoff in the README). The free-tier PaaS deployment is what stays live and public, not the AWS/Terraform one.
- CI/CD pipeline automation (can be a follow-up; a GitHub Actions stub with a comment explaining intended stages is enough if you have time, not a requirement)

If at any point a request from me tries to expand scope mid-build, remind me of this scope list before proceeding.

## Tech stack

- **Frontend:** React (functional components, hooks) — application form, status tracker page, and admin analytics dashboard
- **Charting:** Recharts (or your recommendation — explain why if different)
- **Backend API:** Node.js + Express, TypeScript preferred if you think it meaningfully helps here — tell me your reasoning if you pick TypeScript over plain JS
- **Auth:** JWT (access + refresh tokens), role-based middleware (applicant/admin)
- **Rate limiting:** express-rate-limit or equivalent
- **Queue:** Redis + BullMQ
- **AI/KYC worker:** Python service (FastAPI is fine) — OCR via an open-source library (e.g. Tesseract) and LLM calls via the Anthropic API for field extraction/reasoning (I'll provide the API key separately as an env var — never hardcode it)
- **Database:** PostgreSQL, with a migrations tool (e.g. Prisma or Knex — your call, explain why)
- **Testing:** Jest for Node/React, Pytest for the Python service
- **Local orchestration:** Docker Compose (Postgres, Redis, API, worker, frontend)
- **IaC:** Terraform, targeting AWS (or explain if you recommend a different provider and why) — for the interview-prep demo environment only
- **Live public hosting:** free-tier PaaS (e.g. Render/Railway + Vercel + Neon + Upstash) — this is the deployment that stays up and gets shared publicly

## Build phases — build in this order, one at a time

1. **Repo scaffolding** — folder structure, Docker Compose skeleton, README stub, linting/formatting config. Explain the folder layout choices.
2. **Database schema + migrations** — applications table, audit_trail table, users table (for auth), explain each field's business purpose (e.g. why we store a dedupe key, why the audit trail is append-only).
3. **Auth** — JWT-based signup/login, role middleware (applicant/admin), rate limiting on public endpoints. Tests for token validation, expiry, and role enforcement.
4. **Node/Express API — application submission** — idempotent POST endpoint, validation, persists to DB, enqueues a job. Tests for idempotency (same dedupe key twice → one record) and validation failures.
5. **Queue + worker skeleton** — BullMQ producer/consumer wiring, dead-letter queue, a no-op worker first just to prove the pipeline connects end to end. Tests for job retry behavior.
6. **AI KYC service** — OCR + LLM extraction endpoint, called by the worker. Explain your prompt design for the LLM extraction step and why you structured it that way (e.g. asking for structured JSON output, why certain fields are flagged for mismatch).
7. **Risk scoring module** — rule-based checks + LLM-assisted reasoning over flags, producing a score and explanation. Tests covering at least: clean application (low risk), mismatched name (flagged), blurry doc (flagged), rapid repeat applications (flagged).
8. **Mock bank-partner API + circuit breaker** — standalone mock service with configurable failure/latency injection, called from the worker with retry + backoff + circuit breaker. Tests that prove the circuit opens after repeated failures and half-opens/recovers correctly.
9. **Onboarding decision + audit trail wiring** — final approve/reject logic, writes decision + full audit trail. Integration test running a full application through the entire pipeline end to end (happy path) and one forced-failure path (bank API down → retries → eventual state).
10. **Applicant frontend** — application form, upload, and a status tracker page polling/reading application state.
11. **Admin dashboard** — analytics views (funnel drop-off, approval rate, risk score distribution, processing time, KYC failure reasons), gated behind the admin role.
12. **Infrastructure as Code** — Terraform modules for VPC, compute (ECS/Fargate or EC2), RDS, ElastiCache, S3, IAM roles. README section mapping each Terraform resource back to a box in the architecture diagram, plus the WAF placement note. Demo it once, then note the teardown step.
13. **Live public deployment** — deploy to the chosen free-tier PaaS combination so there's a real, stable, shareable URL. Cover environment variable setup, connecting the managed Postgres/Redis, and any CORS/build config gotchas for each platform. Confirm the full pipeline works end to end on the live URL, not just locally.
14. **Polish pass** — README finalization (architecture diagram description, how to run locally, how to run tests, how it's deployed, explicitly listed scope/out-of-scope), verify comments are consistent throughout, final test run summary.

## Constraints and preferences

- Prefer clear, readable code over clever code — this is a codebase meant to be read by strangers on LinkedIn/GitHub.
- Every external call (LLM, mock bank API, DB) should have explicit error handling — no silent failures.
- No hardcoded secrets — use `.env` with a `.env.example` checked in, and Terraform variables for infra-level secrets.
- Keep commit-sized chunks of work per phase so I can review diffs meaningfully.
- If you generate a lot of boilerplate, still add the "what/how/why" comment blocks — don't skip commenting on generated code.

---

Start with **Phase 1 only**. Explain your planned folder structure and Docker Compose approach before creating files, then scaffold it. Wait for me to say "continue" before moving to Phase 2 or any later phase.
