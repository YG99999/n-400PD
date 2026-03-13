# CitizenFlow

CitizenFlow is a production-shaped N-400 form-preparation app. It provides a guided intake flow, direct review/editing, payment gating, background PDF generation, persistent account state, support requests, and legal/privacy surfaces for a B2C self-serve launch.

CitizenFlow is not a law firm and does not provide legal advice.

## Production runtime

- Node `20.19.0` is required for the current Vite toolchain.
- Build once with `npm run build`.
- Start the web service with `npm start`.
- Start the background worker with `npm run worker`.

## What is implemented

- React + Express application with hash-based routing
- Supabase Auth-ready account flows with bearer-token protected APIs
- Supabase/Postgres-ready persistence for users, sessions, payments, jobs, documents, support tickets, audit events, and privacy requests
- Guided chat intake, review editing, payment flow, and PDF generation
- Background-style document job queue semantics
- Account page for support, document history, preferences, export requests, and deletion requests
- Legal pages for privacy, terms, and refunds
- Health and readiness endpoints
- Typecheck, Playwright e2e coverage, and GitHub Actions CI

## Local setup

```bash
npm install
pip install pymupdf
copy .env.example .env
```

Set these values in your environment or `.env` before running production-style checks:

- `SESSION_SECRET`
- `APP_URL`
- `PAYMENT_AMOUNT_CENTS`
- `SUPPORTED_USCIS_EDITION`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`

Run the app:

```bash
npm run dev
```

The app runs at `http://localhost:5000`.

## Demo mode

Click `Try Demo` on the landing page or sign in with:

- Email: `demo@citizenflow.app`
- Password: `demo123`

## Validation commands

```bash
npm run check
npm run health:check
npm run test:ui
```

## Operational endpoints

- `GET /healthz`: lightweight liveness response
- `GET /readyz`: readiness checks for seeded state and local runtime prerequisites

## CI

GitHub Actions workflow: [.github/workflows/ci.yml](C:/Users/ynger/Downloads/n400-citizenflow-project/.github/workflows/ci.yml)

It runs:

- dependency install
- Python/PyMuPDF setup
- typecheck
- build
- launch-readiness script
- Playwright e2e

## Launch docs

- [Launch checklist](C:/Users/ynger/Downloads/n400-citizenflow-project/docs/LAUNCH_CHECKLIST.md)
- [Operations runbook](C:/Users/ynger/Downloads/n400-citizenflow-project/docs/OPS_RUNBOOK.md)
- [Security baseline](C:/Users/ynger/Downloads/n400-citizenflow-project/docs/SECURITY_BASELINE.md)
- [ElevenLabs agent setup](C:/Users/ynger/Downloads/n400-citizenflow-project/docs/ELEVENLABS_AGENT_SETUP.md)

## Current launch boundary

This repo now expects production to run with:

- Supabase-backed auth, persistence, and private storage
- Stripe Checkout plus verified webhook processing
- background worker-driven PDF generation
- public demo mode disabled

The remaining non-code launch work is operational:

- support inbox ownership and SLA
- manual export/deletion fulfillment workflow
- external error tracking and alerting
- legal review of disclaimers, refund copy, and filing guidance
