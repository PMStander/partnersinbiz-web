# Payments — Environment Variables

Required for the payments + invoice-status system (EFT primary, PayPal
secondary). Add all of these to Vercel env vars (Preview + Production).

## PayPal (optional — EFT works without it)

```
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENV=sandbox|live          # default: live
PAYPAL_WEBHOOK_ID=...            # required for /api/v1/webhooks/paypal signature verification
```

When `PAYPAL_CLIENT_ID` is unset, the `/payment-instructions` response
returns `paypal.available = false` and PayPal-related routes return a
`503 PayPal is not configured`.

## Public URLs

```
PUBLIC_BASE_URL=https://partnersinbiz.online
```

Used for:

- The public invoice view URL (`/invoice/<publicToken>`) returned in
  `PaymentInstructions.publicViewUrl`.
- The PayPal order `return_url` / `cancel_url`.
- The PDF link included in the outbound invoice email.

Falls back to `NEXT_PUBLIC_APP_URL` (already defined for the rest of the
app) if unset, then to `https://partnersinbiz.online`.

## Already configured (used by this module)

- `RESEND_API_KEY` — for outbound invoice emails on `/send`.
- `CRON_SECRET` — bearer token for the `/api/cron/invoices` extended
  overdue sweep.
- `AI_API_KEY` — admin-role key used by the Hermes agent to call these
  endpoints.

## Notes

- **Sandbox testing.** Set `PAYPAL_ENV=sandbox` in Preview and register a
  separate webhook in the PayPal sandbox dashboard pointing at the
  Preview deploy URL. Use the sandbox webhook id for `PAYPAL_WEBHOOK_ID`.
- **Webhook events to subscribe to** in the PayPal dashboard:
  `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`. The other event
  types are ignored by the handler.
