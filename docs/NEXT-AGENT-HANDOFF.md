# Next Agent Handoff

## Current status

CardAcquire is a local full-stack portfolio system with applicant and admin web flows, Node/Express API, Prisma/PostgreSQL, Redis/BullMQ, Python FastAPI KYC/risk service, mock bank partner, onboarding audit trail, Terraform AWS demo infrastructure, and Render/Vercel deployment configuration.

The live local worker path is connected: `SUBMITTED -> KYC_IN_PROGRESS -> RISK_REVIEW -> PARTNER_VERIFICATION -> APPROVED/REJECTED`. The assistant panel and safe assistant API are now present. Public provider accounts and repository pushes still require the user.

## Repository map

- `apps/web`: React/Vite applicant form, tracker, admin dashboard, assistant panel.
- `apps/api`: Express routes, auth, Prisma access, BullMQ producer/worker, onboarding, partner client, analytics, assistant API.
- `services/kyc-worker`: FastAPI OCR, optional Anthropic extraction, risk scoring.
- `services/bank-partner-mock`: latency/failure-injection partner simulator.
- `infra/terraform`: disposable AWS VPC, ECS, RDS, Redis, S3, IAM, and ALB configuration.
- `docs/COMMANDS.md`: complete local run and inspection commands.

## Important configuration

- `DATABASE_URL`: local PostgreSQL or Neon connection string.
- `REDIS_URL`: local Redis or Upstash `rediss://` URL.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: required API secrets.
- `KYC_SERVICE_URL`, `BANK_PARTNER_URL`: worker service URLs.
- `ANTHROPIC_API_KEY`: user-owned secret; never commit or paste into chat.
- `KYC_USE_LLM=true`: enables Anthropic extraction/reasoning in the worker. Rules remain authoritative.
- `VITE_API_BASE_URL`, `FRONTEND_ORIGIN`: frontend/API CORS configuration.

## AI behavior and next AI task

AI integration exists in `services/kyc-worker/app/llm.py` for structured identity extraction and risk explanation. It is controlled, opt-in by configuration, and cannot make an approval decision. The assistant API is in `apps/api/src/assistant/service.ts`; it currently supports safe local intents for explaining KYC, starting an application, and checking status. The next AI enhancement can add grounded Anthropic responses to this service while retaining explicit actions and ownership checks.

## Next requested feature: chatbot

The right-side assistant panel is implemented in `apps/web/src/App.tsx`. Keep its action contract safe:

- `START_APPLICATION` may open the form.
- `SHOW_STATUS` may query only the authenticated user's application.
- Never let chat approve/reject, change risk scores, or expose another applicant's data.

## Deployment next steps

1. Create Neon PostgreSQL and Upstash Redis databases.
2. Deploy the complete Render Blueprint: API, public KYC web service, Node processing worker, and mock partner.
3. Deploy `apps/web` to Vercel.
4. Set `FRONTEND_ORIGIN` and `VITE_API_BASE_URL` to final public URLs.
5. Run signup, upload, approval/failure, assistant, audit, and admin smoke tests.

## Validation baseline

- Node API tests: 9 suites, 20 tests before assistant additions.
- Python KYC/risk tests: 9 passing.
- Frontend production build passing.
- Terraform validation passing.
- Live readable document path previously reached `APPROVED`; unreadable document path reached `KYC_FAILED`.
