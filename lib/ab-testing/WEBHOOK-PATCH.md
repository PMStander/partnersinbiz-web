# Email Webhook patch — A/B variant attribution

## File: `app/api/v1/email/webhook/route.ts`

The Resend webhook needs to bump the per-variant stat on the parent broadcast or sequence step whenever the email doc carries a `variantId`. This patch was applied directly when this slice landed.

## What changed

1. After locating the matching `emails/<id>` doc, also read `variantId`, `broadcastId`, `sequenceId`, and `sequenceStep` from the email doc.
2. When the event maps to a stat field (`delivered`, `opened`, `clicked`, `bounced`, `unsubscribed`), call `incrementVariantStat` from `@/lib/ab-testing/cronHelpers` to bump the variant's counter on the parent doc.

## Exact insertion

Right after the campaign-stat block, add an A/B attribution block that also runs on `email.sent` is **not** needed because the sender (cron/broadcast worker) bumps `sent` itself at send time. The webhook only needs to roll up downstream events.

### Mapping

| Webhook event           | Variant stat field |
| ----------------------- | ------------------ |
| `email.delivered`       | `delivered`        |
| `email.opened`          | `opened`           |
| `email.clicked`         | `clicked`          |
| `email.bounced`         | `bounced`          |
| `email.complained`      | `unsubscribed`     |

### Code (already applied)

```ts
// Imports at top
import { incrementVariantStat, type VariantStatField } from '@/lib/ab-testing/cronHelpers'

// Inside the handler, after the campaign-stat update block:
const variantId: string = (emailData as { variantId?: string })?.variantId ?? ''
const broadcastId: string = (emailData as { broadcastId?: string })?.broadcastId ?? ''
const sequenceId: string = (emailData as { sequenceId?: string })?.sequenceId ?? ''
const sequenceStep: number | null = (emailData as { sequenceStep?: number | null })?.sequenceStep ?? null

const variantStatField: VariantStatField | null =
  type === 'email.delivered' ? 'delivered'
  : type === 'email.opened' ? 'opened'
  : type === 'email.clicked' ? 'clicked'
  : type === 'email.bounced' ? 'bounced'
  : type === 'email.complained' ? 'unsubscribed'
  : null

if (variantId && variantStatField) {
  try {
    if (broadcastId) {
      await incrementVariantStat({
        targetCollection: 'broadcasts',
        targetId: broadcastId,
        variantId,
        field: variantStatField,
      })
    } else if (sequenceId && typeof sequenceStep === 'number') {
      await incrementVariantStat({
        targetCollection: 'sequences',
        targetId: sequenceId,
        stepNumber: sequenceStep,
        variantId,
        field: variantStatField,
      })
    }
  } catch (err) {
    console.error('[email/webhook] failed to bump variant stat', { broadcastId, sequenceId, sequenceStep, variantId, variantStatField, err })
  }
}
```

### Sender contract

For the attribution to work, the sender (`cron/sequences`, broadcast cron, manual send) must:
1. Call `pickVariantForSend(...)` before sending.
2. Apply `applyVariantOverrides(base, variant)` to get the effective email content.
3. Persist the resulting email doc with `variantId: variant?.id ?? ''`.
4. After a successful Resend send, bump `sent` on the variant via `incrementVariantStat({ ..., field: 'sent' })`. The webhook never sees a "sent" event from Resend, so the sender is authoritative for that field.

### Note on emails sent BEFORE this slice landed

Existing email docs default to `variantId: ''`. The webhook is a no-op for them (variantId empty → no attribution). Existing campaign stat behaviour is preserved.
