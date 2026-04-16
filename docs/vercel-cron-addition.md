# vercel.json — cron addition (outbound webhooks worker)

Add the following entry to the `crons` array in `vercel.json`:

```json
{ "path": "/api/cron/webhooks", "schedule": "* * * * *" }
```

- Runs every minute.
- Route is `app/api/cron/webhooks/route.ts`.
- Auth: `Authorization: Bearer ${CRON_SECRET}` OR Vercel's built-in
  `x-vercel-cron` header.
- Processes up to 50 pending `webhook_queue` items per invocation.
- Do NOT edit `vercel.json` from inside the A10-webhooks agent — Peet (or the
  main agent) will apply this in Phase C.
