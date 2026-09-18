# CardAcquire Commands

This is the local operator runbook for the full CardAcquire stack.

## Start PostgreSQL and Redis

```bash
newgrp docker -c 'docker compose up -d postgres redis'
docker compose ps
newgrp docker -c 'docker exec "$(docker compose ps -q redis)" redis-cli ping'
newgrp docker -c 'docker exec "$(docker compose ps -q postgres)" pg_isready -U cardacquire -d cardacquire'
```

## Apply database migrations

```bash
export DATABASE_URL='postgresql://cardacquire:cardacquire_local_only@localhost:5432/cardacquire'
npm run prisma:validate --workspace=@cardacquire/api
npm run prisma:migrate:dev --workspace=@cardacquire/api
npm run prisma:migrate:deploy --workspace=@cardacquire/api
```

## Start each service

Use separate terminals.

```bash
# API
export DATABASE_URL='postgresql://cardacquire:cardacquire_local_only@localhost:5432/cardacquire'
export REDIS_URL='redis://localhost:6379'
export JWT_ACCESS_SECRET='local-demo-access-secret'
export JWT_REFRESH_SECRET='local-demo-refresh-secret'
export KYC_SERVICE_URL='http://localhost:8000'
export BANK_PARTNER_URL='http://localhost:4000'
npm run dev --workspace=@cardacquire/api
```

```bash
# KYC service with Tesseract
newgrp docker -c 'docker compose build worker && docker compose up -d worker'
```

```bash
# Mock bank partner
npm run dev --workspace=@cardacquire/bank-partner-mock
```

```bash
# BullMQ worker
export DATABASE_URL='postgresql://cardacquire:cardacquire_local_only@localhost:5432/cardacquire'
export REDIS_URL='redis://localhost:6379'
export JWT_ACCESS_SECRET='local-demo-access-secret'
export JWT_REFRESH_SECRET='local-demo-refresh-secret'
export KYC_SERVICE_URL='http://localhost:8000'
export BANK_PARTNER_URL='http://localhost:4000'
npm run worker --workspace=@cardacquire/api
```

```bash
# Frontend
export VITE_API_BASE_URL='http://localhost:3000'
npm run dev --workspace=@cardacquire/web -- --host 0.0.0.0
```

Open `http://localhost:5173`.

## Health checks

```bash
curl http://localhost:3000/health
curl http://localhost:8000/health
curl http://localhost:4000/health
```

## Applicant API flow

```bash
EMAIL="demo.$(date +%s)@example.com"
PASSWORD='LocalDemo123'
SIGNUP=$(curl -sS -X POST http://localhost:3000/auth/signup \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$SIGNUP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tokens"]["accessToken"])')

curl -sS -X POST http://localhost:3000/applications \
  -H "Authorization: Bearer $TOKEN" \
  -F "dedupeKey=demo-$(date +%s)" \
  -F 'applicantName=Runtime Demo' \
  -F 'dateOfBirth=1990-01-01' \
  -F 'idDocument=@apps/api/uploads/readable-id.png;type=image/png'
```

Use the returned application ID:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/applications/APPLICATION_ID

curl -sS -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/applications/APPLICATION_ID/audit
```

## Database inspection

```bash
newgrp docker -c 'docker exec -it "$(docker compose ps -q postgres)" psql -U cardacquire -d cardacquire'
```

```sql
SELECT id, status, risk_score, kyc_failure_reason, decision_reason
FROM applications
ORDER BY created_at DESC;

SELECT application_id, from_status, to_status, event, metadata, created_at
FROM audit_trail
ORDER BY created_at ASC;
```

## Redis and BullMQ inspection

```bash
newgrp docker -c 'docker exec "$(docker compose ps -q redis)" redis-cli DBSIZE'
newgrp docker -c 'docker exec "$(docker compose ps -q redis)" redis-cli KEYS "bull:application-processing*"'
docker compose logs -f worker
```

## Optional Anthropic AI integration

The repository includes Anthropic integration for structured KYC extraction and risk explanation. It is enabled by configuration, but the secret must be supplied by you through the terminal or provider dashboard. Never commit it or paste it into chat.

```bash
export ANTHROPIC_API_KEY='your_real_key_here'
export ANTHROPIC_MODEL='claude-3-5-haiku-latest'
export KYC_USE_LLM=true
newgrp docker -c 'docker compose up -d --build worker'
```

The local rules remain authoritative. Anthropic enriches extraction/reasoning and cannot approve or reject an application.

## Tests and builds

```bash
npm test --workspace=@cardacquire/api
npm run typecheck --workspace=@cardacquire/api
npm run typecheck --workspace=@cardacquire/bank-partner-mock
npm run build --workspace=@cardacquire/web
PYTHONPATH=services/kyc-worker services/kyc-worker/.venv/bin/python -m pytest -q services/kyc-worker/tests
export PATH="$HOME/.local/bin:$PATH"
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform validate
```

## Troubleshooting

- Docker permission denied: run the command through `newgrp docker -c '...'` or open a new login shell.
- API cannot connect to Prisma: export `DATABASE_URL` and confirm PostgreSQL is healthy.
- Application stays `SUBMITTED`: start the BullMQ worker and verify Redis is reachable.
- Application becomes `KYC_FAILED`: inspect `docker compose logs -f worker`; blank/tiny images are intentionally rejected.
- Frontend cannot reach API: set `VITE_API_BASE_URL` and API `FRONTEND_ORIGIN` consistently.
- AI errors: verify `ANTHROPIC_API_KEY`, `KYC_USE_LLM=true`, and the worker was rebuilt after changing environment variables.
