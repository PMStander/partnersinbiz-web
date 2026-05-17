# CRM Sub-1 PR 7 — Quotes Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Migrate 2 quote routes to `withCrmAuth`. Preserve atomic quote numbering, all 3 webhook events (`quote.created`/`quote.accepted`/`quote.rejected`), and the special `action='convert-to-invoice'` PATCH path.

**Spec role matrix:**
| Route | GET | POST | PATCH | DELETE |
|---|---|---|---|---|
| `/quotes` root | viewer | member | — | — |
| `/quotes/[id]` | viewer | — | member | admin |

(Note: routes live at `/quotes/`, NOT `/crm/quotes/`.)

**Baseline gotchas:**
- All routes currently `withAuth('admin')` — big role downgrades on GET (viewer), POST/PATCH (member)
- No `withIdempotency` baseline → no regression concern
- **Quote numbering:** atomic `runTransaction` on `organizations/{orgId}/counters/quotes` — preserve verbatim
- **Convert-to-invoice path:** PATCH `{ action: 'convert-to-invoice' }` calls `generateInvoiceNumber`, sets `status: 'converted'`, stores `convertedInvoiceId` — preserve verbatim
- **Status enum:** type allows `draft|sent|accepted|declined|expired|converted` but route fires webhooks on `accepted`/`rejected`. Confirm exact transitions in Task 2.
- No existing tests — PR 7 creates them all

**Forward-looking patterns (PR 3-6) to USE:**
1. `ctx.actor` directly (no `snapshotForWrite`)
2. Explicit-field webhook payloads (no `...body` spread)
3. `where`-respecting isolation mock
4. Empty-body guard on PATCH
5. `loadQuote(id, ctxOrgId)` helper (exists + orgId + deleted)
6. `{ ...data, id }` spread order (PR 6 type-warning lesson)
7. Best-effort side effects wrapped in try/catch (PR 3 `tryAttributeDealWon` lesson)

**Base SHA:** `3f68841` (PR 6 ship). **Working dir:** `/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web`

---

## File Structure

**Modified routes (2):**
- `app/api/v1/quotes/route.ts` — GET viewer, POST member. Preserve atomic quote numbering. Write `createdByRef`/`updatedByRef`. Explicit-field `quote.created` webhook.
- `app/api/v1/quotes/[id]/route.ts` — GET viewer, PATCH member (with `convert-to-invoice` special path), DELETE admin. `loadQuote` helper. Empty-body guard on PATCH. Status-transition webhooks (`quote.accepted`, `quote.rejected`) with explicit-field payloads.

**New tests (3):**
- `__tests__/api/v1/quotes/quotes.test.ts` (root)
- `__tests__/api/v1/quotes/quotes-id.test.ts` ([id])
- `__tests__/api/v1/quotes/quotes-tenant-isolation.test.ts` (consolidated isolation suite)

**Constraint:** Zero `lib/*` changes. `runTransaction` on counter docs untouched.

---

## Tasks

### Task 1: Migrate `/quotes/route.ts` (GET + POST)

**Role matrix:** GET viewer, POST member.

- [ ] Step 1: Read current route + `lib/quotes/types.ts`. Note: atomic `runTransaction` on `organizations/{orgId}/counters/quotes` for quote numbering — copy the transaction body verbatim.

- [ ] Step 2: Write `__tests__/api/v1/quotes/quotes.test.ts` with `stageAuth` extended for `quotes` collection + counter doc transaction. Tests:
  - viewer can GET list (own org scoped)
  - viewer cannot POST → 403
  - member POST creates quote with `createdByRef`/`updatedByRef` + auto-generated `quoteNumber`
  - agent (Bearer) POST uses AGENT_PIP_REF
  - POST validation: orgId/lineItems required → 400
  - webhook `quote.created` dispatched with explicit fields (no body spread; assert payload keys exactly)

- [ ] Step 3: Run → fail.

- [ ] Step 4: Migrate. Use `withCrmAuth('viewer' | 'member', ...)`. Use `ctx.actor` directly. Preserve `runTransaction`-based numbering. Webhook payload uses explicit fields. Sanitize undefined.

  ```typescript
  // After atomic numbering, build quote data:
  const actorRef = ctx.actor
  const quoteData = {
    orgId: ctx.orgId,
    quoteNumber,
    lineItems,
    status: 'draft',
    // ... existing field copy ...
    createdBy: ctx.isAgent ? undefined : ctx.actor.uid,
    createdByRef: actorRef,
    updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
    updatedByRef: actorRef,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  const sanitized = Object.fromEntries(Object.entries(quoteData).filter(([, v]) => v !== undefined))
  // ...write doc...
  
  try {
    await dispatchWebhook(ctx.orgId, 'quote.created', {
      id: docRef.id,
      quoteNumber,
      status: 'draft',
      total: quoteData.total,
      currency: quoteData.currency,
      validUntil: quoteData.validUntil,
      createdByRef: actorRef,
    })
  } catch (e) { console.error('webhook dispatch error', e) }
  ```

- [ ] Step 5: Run → pass.

- [ ] Step 6: Commit `feat(crm): migrate quotes root route to withCrmAuth + MemberRef attribution (numbering + webhook preserved)`

---

### Task 2: Migrate `/quotes/[id]/route.ts` (GET + PATCH + DELETE)

**Role matrix:** GET viewer, PATCH member (with convert-to-invoice path), DELETE admin.

- [ ] Step 1: Read current route. Note all 3 special paths:
  - **Convert-to-invoice:** `body.action === 'convert-to-invoice'` → call `generateInvoiceNumber`, write invoice doc, mark quote `status: 'converted'` + `convertedInvoiceId`
  - **Status transitions:** `draft → sent` sets `sentAt`; `* → accepted` sets `acceptedAt`; webhooks fire on `accepted` and `rejected`
  - **Regular updates:** preserve any other patchable fields

- [ ] Step 2: Write `__tests__/api/v1/quotes/quotes-id.test.ts`. Tests:
  - viewer GET (own org), cross-org → 404, deleted → 404
  - member PATCH status `draft → sent` sets `sentAt` + `updatedByRef`, no webhook
  - member PATCH status to `accepted` sets `acceptedAt` + fires `quote.accepted` webhook with explicit fields
  - member PATCH status to `rejected` fires `quote.rejected` webhook with explicit fields
  - member PATCH `action: 'convert-to-invoice'` creates invoice + sets `status: 'converted'` + `convertedInvoiceId` (mock `generateInvoiceNumber`)
  - PATCH empty body → 400
  - viewer cannot PATCH → 403
  - cross-org PATCH/DELETE → 404
  - admin DELETE → 200 (member DELETE → 403)
  - agent (Bearer) bypasses admin gate
  - agent PATCH uses AGENT_PIP_REF in updatedByRef

- [ ] Step 3: Run → fail.

- [ ] Step 4: Migrate. Add `loadQuote(id, ctxOrgId)` helper. Use `handleQuoteUpdate` shared function (PR 3-5 pattern). PATCH:
  - Empty-body guard FIRST
  - Branch on `body.action === 'convert-to-invoice'` → special path
  - Else regular status update with transition side effects (sentAt/acceptedAt) + webhooks
  - All best-effort side effects (webhook, generateInvoiceNumber inside catch) wrapped in try/catch (PR 3 lesson)
  - `updatedByRef` written on every patch
  - Use `{ ...data, id }` spread order (PR 6 lesson)

- [ ] Step 5: Run → pass.

- [ ] Step 6: Commit `feat(crm): migrate quotes/[id] route to withCrmAuth + status webhooks + convert-to-invoice preserved`

---

### Task 3: Cross-tenant isolation suite

**File:** Create `__tests__/api/v1/quotes/quotes-tenant-isolation.test.ts`

Mirror `__tests__/api/v1/forms/forms-tenant-isolation.test.ts` (PR 6 commit `a443f43`). Use `where`-respecting mock for `quotes` collection. Distinct UIDs.

Tests (~10):
- member POST scoped to org-a with `createdByRef.displayName='A M'`
- agent POST AGENT_PIP_REF
- viewer cannot POST → 403
- viewer GET list returns ONLY org-a (catches missing `where('orgId')`)
- member cannot PATCH cross-org quote → 404
- admin cannot DELETE cross-org quote → 404
- member cannot DELETE → 403 (role gate)
- agent DELETE bypasses admin gate
- PATCH status to accepted fires `quote.accepted` webhook with explicit fields
- convert-to-invoice flips status to converted + stores invoiceId

Commit: `test(crm): consolidated cross-tenant isolation suite for quotes routes (PR 7)`

---

### Task 4: Final verification + push

- [ ] Full jest — all green
- [ ] Build — clean (watch for `{ id, ...data }` type warnings)
- [ ] Verify only quotes files touched
- [ ] Push: `git push origin main`
- [ ] Update wiki

---

## Ship Gate
- 2 routes migrated
- ~25-30 new tests
- `npm run build` clean
- Zero `lib/*` changes
- Quote numbering counter behavior preserved (atomic, no duplicate numbers under concurrency)

---

## Risks + watch-outs

- **Quote numbering atomicity:** `runTransaction` is fragile. Don't add awaits between `transaction.get(counterRef)` and `transaction.set(counterRef, ...)`. Copy verbatim from baseline.
- **`generateInvoiceNumber` for convert-to-invoice:** same atomic pattern — preserve verbatim
- **Status enum mismatch:** `lib/quotes/types.ts` allows `declined` but route handles `rejected` — webhook event name is `quote.rejected`. Audit and preserve baseline behavior; don't "fix" the enum here.
- **Spread-id pattern (PR 6 lesson):** use `{ ...data, id }` not `{ id, ...data }`.
- **Best-effort wraps (PR 3 lesson):** `dispatchWebhook` + `generateInvoiceNumber` errors must not bubble out — wrap in try/catch.

---

## Next step

PR 8 cleanup — legacy `/api/v1/contacts/[id]/preferences` migration + remove old `withAuth + resolveOrgScope` imports across CRM + final consolidated isolation sweep + **`withIdempotency` systemic decision** (restore across CRM POSTs or formally drop) + skill doc cross-refs update.
