# Operations Runbook

## Health checks

- `GET /healthz` should return `200` with `ok: true`.
- `GET /readyz` should return `200` when seeded runtime prerequisites are available.
- `npm run health:check` should pass in CI and before release.

## Common failures

## App boots but PDFs fail

- Confirm Python is installed.
- Confirm `pymupdf` is installed.
- Confirm `server/pdf/n400_acroform.pdf` exists in the deployment artifact.
- Check document job status from the account page or `/api/jobs/:jobId`.

## Auth issues

- Confirm `SESSION_SECRET` is set.
- Confirm cookies are not blocked by proxy or domain mismatch.
- In production, verify `APP_URL` and secure-cookie settings match the deployed origin.

## Data/state issues

- Check `.data/store.json` exists and is writable.
- Check `generated_pdfs/` exists and is writable.
- Back up both locations before redeploys if running this local-storage version.

## Release process

1. Run `npm run check`.
2. Run `npm run build`.
3. Run `npm run health:check`.
4. Run `npm run test:ui`.
5. Deploy.
6. Verify `/healthz` and `/readyz`.
7. Confirm the document worker is running.
8. Complete one test payment and confirm document generation and Supabase Storage delivery.
