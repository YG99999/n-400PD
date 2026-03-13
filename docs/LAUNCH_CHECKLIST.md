# Launch Checklist

## Product

- Verify all landing, auth, chat, review, payment, account, privacy, terms, and refund routes load in production build.
- Confirm unsupported-case and disclaimer language match your final legal review.
- Confirm supported USCIS edition in `.env` matches the PDF template in `server/pdf`.

## Operations

- Set `SESSION_SECRET`, `APP_URL`, `PAYMENT_AMOUNT_CENTS`, `SUPPORTED_USCIS_EDITION`, Supabase keys, and Stripe keys including `STRIPE_PRICE_ID`.
- Set `PUBLIC_DEMO_ENABLED=false`, `SECURE_COOKIES=true`, `INLINE_DOCUMENT_PROCESSING=false`, `ALLOW_PRODUCTION_FALLBACKS=false`, and `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=false`.
- Run `npm run check`.
- Run `npm run health:check`.
- Run `npm run test:ui`.
- Verify `/healthz` and `/readyz` return success in the deployed environment.

## Security

- Use a non-default `SESSION_SECRET`.
- Enable `SECURE_COOKIES=true` in production.
- Keep public demo disabled in production.
- Keep production fallbacks disabled so missing Stripe/Supabase config fails closed.
- Restrict access to deployment secrets.
- Confirm generated documents and `.data` are backed up and access controlled.

## Support

- Verify support inbox ownership for account-submitted support tickets.
- Define response SLA for billing and technical tickets.
- Define who reviews export and deletion requests.

## Commercial

- Verify the configured Stripe Checkout price and webhook endpoint in the live environment.
- Confirm refund policy, privacy policy, and terms match your real business process.
- Confirm customer receipt and support follow-up process.
