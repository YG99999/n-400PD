# Security Baseline

## Implemented in this repo

- Password hashing with `scrypt`
- Server-side sessions with HttpOnly cookies
- Basic security headers
- Basic per-route rate limiting
- Audit-event persistence for auth, payments, documents, support, and account requests
- Auth-gated document downloads and account endpoints

## Required before public launch

- Replace mock payments with Stripe Checkout and webhook verification
- Replace local JSON persistence with managed database storage
- Replace filesystem PDF storage with managed object storage
- Add password reset and email verification
- Add external error tracking and structured log shipping
- Add secret rotation and backup/restore procedure

## Sensitive data handling

- Treat `.data/store.json` and `generated_pdfs/` as sensitive
- Do not send those files to analytics or unsecured log sinks
- Restrict local and deployment access to operators only
