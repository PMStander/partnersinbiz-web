# Invoicing Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the invoicing system with org selector, proper currency display, live preview, billing details management, quote-to-invoice workflow, and client-prefixed invoice numbers.

**Architecture:** Extend the Organization type with billing/address fields. Add a Quote type that mirrors Invoice. Build a currency formatter utility used everywhere. Invoice numbers change from `PIB-YYYY-NNN` to `CLI-001` format (first 3 letters of client name + sequential per-client count). Preview renders the existing HTML generator inline via iframe.

**Tech Stack:** Next.js 16, React 19, Firebase/Firestore, TypeScript, Tailwind CSS 4

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `lib/organizations/types.ts` | Add `BillingDetails` and `Address` interfaces to Organization |
| Modify | `app/api/v1/organizations/[id]/route.ts` | Accept `billingDetails` in PUT |
| Create | `lib/invoices/format-currency.ts` | Shared `formatCurrency(amount, currency)` used by all invoice UI |
| Modify | `lib/invoices/types.ts` | Add `Quote` type, add `clientName`, `clientAddress`, `fromDetails` fields to Invoice |
| Modify | `lib/invoices/html-generator.ts` | Render billing addresses, banking details, use proper "From" details |
| Modify | `app/(admin)/admin/invoicing/new/page.tsx` | Org selector dropdown, currency-aware amounts, preview button |
| Create | `app/(admin)/admin/invoicing/new/invoice-preview-modal.tsx` | Modal that renders invoice HTML in iframe |
| Modify | `app/(admin)/admin/invoicing/[id]/page.tsx` | Fix hardcoded `$` signs, use currency formatter |
| Modify | `app/(admin)/admin/invoicing/page.tsx` | Fix hardcoded `$` in stats section |
| Modify | `app/api/v1/invoices/route.ts` | New invoice number format, store client name/address/from details |
| Modify | `app/api/v1/invoices/[id]/route.ts` | Accept quote conversion |
| Create | `lib/invoices/invoice-number.ts` | Generate client-prefixed invoice numbers (`CLI-001`) |
| Create | `app/(admin)/admin/org/[slug]/settings/page.tsx` | Org settings page with billing address, VAT, banking details |
| Create | `lib/quotes/types.ts` | Quote type definition |
| Create | `app/api/v1/quotes/route.ts` | GET/POST quotes |
| Create | `app/api/v1/quotes/[id]/route.ts` | GET/PATCH/DELETE + convert-to-invoice |
| Create | `app/(admin)/admin/quotes/page.tsx` | Quotes list page |
| Create | `app/(admin)/admin/quotes/new/page.tsx` | New quote form (shares structure with invoice form) |
| Create | `app/(admin)/admin/quotes/[id]/page.tsx` | Quote detail + accept/convert actions |
| Create | `app/api/v1/invoices/next-number/route.ts` | GET next invoice number for a given orgId (preview) |

---

## Task 1: Shared Currency Formatter

**Files:**
- Create: `partnersinbiz-web/lib/invoices/format-currency.ts`

- [ ] **Step 1: Create the currency formatter module**

```typescript
// lib/invoices/format-currency.ts
import type { Currency } from './types'

const CURRENCY_LOCALES: Record<Currency, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  ZAR: 'en-ZA',
}

export function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] || 'en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function currencySymbol(currency: Currency): string {
  const formatted = formatCurrency(0, currency)
  return formatted.replace(/[\d.,\s]/g, '').trim()
}
```

- [ ] **Step 2: Verify the file was created**

Run: `cat partnersinbiz-web/lib/invoices/format-currency.ts`
Expected: File contents match above.

- [ ] **Step 3: Commit**

```bash
git add partnersinbiz-web/lib/invoices/format-currency.ts
git commit -m "feat(invoicing): add shared currency formatter with locale-aware symbols"
```

---

## Task 2: Extend Organization Type with Billing Details

**Files:**
- Modify: `partnersinbiz-web/lib/organizations/types.ts`

- [ ] **Step 1: Add Address and BillingDetails interfaces**

Add these interfaces before `OrgSettings` in `lib/organizations/types.ts`:

```typescript
// ── Address ──────────────────────────────────────────────────────────────

export interface Address {
  line1: string           // Street address line 1
  line2?: string          // Street address line 2
  city: string
  state?: string          // State/province/region
  postalCode: string
  country: string         // e.g. "South Africa", "United States"
}

// ── Billing Details ──────────────────────────────────────────────────────

export interface BankingDetails {
  bankName: string
  accountHolder: string
  accountNumber: string
  branchCode?: string     // Used in ZA
  routingNumber?: string  // Used in US
  swiftCode?: string      // For international payments
  iban?: string           // For EU payments
}

export interface BillingDetails {
  address?: Address
  vatNumber?: string          // e.g. "4000000000"
  registrationNumber?: string // Company registration
  phone?: string
  bankingDetails?: BankingDetails
}
```

- [ ] **Step 2: Add billingDetails field to Organization interface**

In the `Organization` interface, add after `billingEmail`:

```typescript
  billingDetails?: BillingDetails
```

- [ ] **Step 3: Commit**

```bash
git add partnersinbiz-web/lib/organizations/types.ts
git commit -m "feat(orgs): add Address, BankingDetails, and BillingDetails types"
```

---

## Task 3: Org Settings Page with Billing Details

**Files:**
- Create: `partnersinbiz-web/app/(admin)/admin/org/[slug]/settings/page.tsx`
- Modify: `partnersinbiz-web/app/api/v1/organizations/[id]/route.ts`

- [ ] **Step 1: Update org API to accept billingDetails in PUT**

In `app/api/v1/organizations/[id]/route.ts`, inside the PUT handler, add after the `settings` merge block (around line 72):

```typescript
  if (body.billingDetails && typeof body.billingDetails === 'object') {
    const existingBilling = data.billingDetails ?? {}
    updates.billingDetails = { ...existingBilling, ...body.billingDetails }
    // Deep merge address and bankingDetails
    if (body.billingDetails.address && typeof body.billingDetails.address === 'object') {
      updates.billingDetails.address = { ...(existingBilling.address ?? {}), ...body.billingDetails.address }
    }
    if (body.billingDetails.bankingDetails && typeof body.billingDetails.bankingDetails === 'object') {
      updates.billingDetails.bankingDetails = { ...(existingBilling.bankingDetails ?? {}), ...body.billingDetails.bankingDetails }
    }
  }
```

- [ ] **Step 2: Create the org settings page**

Create `app/(admin)/admin/org/[slug]/settings/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface BillingForm {
  // Address
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
  // Company
  vatNumber: string
  registrationNumber: string
  phone: string
  billingEmail: string
  // Banking
  bankName: string
  accountHolder: string
  accountNumber: string
  branchCode: string
  routingNumber: string
  swiftCode: string
  iban: string
}

const emptyForm: BillingForm = {
  line1: '', line2: '', city: '', state: '', postalCode: '', country: '',
  vatNumber: '', registrationNumber: '', phone: '', billingEmail: '',
  bankName: '', accountHolder: '', accountNumber: '', branchCode: '',
  routingNumber: '', swiftCode: '', iban: '',
}

export default function OrgSettingsPage() {
  const params = useParams()
  const slug = params.slug as string

  const [orgId, setOrgId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [form, setForm] = useState<BillingForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const orgsRes = await fetch('/api/v1/organizations')
      const orgsBody = await orgsRes.json()
      const org = (orgsBody.data ?? []).find((o: any) => o.slug === slug)
      if (!org) { setLoading(false); return }

      setOrgId(org.id)
      setOrgName(org.name)

      // Fetch full org details
      const detailRes = await fetch(`/api/v1/organizations/${org.id}`)
      const detailBody = await detailRes.json()
      const d = detailBody.data
      if (d) {
        const bd = d.billingDetails ?? {}
        const addr = bd.address ?? {}
        const bank = bd.bankingDetails ?? {}
        setForm({
          line1: addr.line1 ?? '',
          line2: addr.line2 ?? '',
          city: addr.city ?? '',
          state: addr.state ?? '',
          postalCode: addr.postalCode ?? '',
          country: addr.country ?? '',
          vatNumber: bd.vatNumber ?? '',
          registrationNumber: bd.registrationNumber ?? '',
          phone: bd.phone ?? '',
          billingEmail: d.billingEmail ?? '',
          bankName: bank.bankName ?? '',
          accountHolder: bank.accountHolder ?? '',
          accountNumber: bank.accountNumber ?? '',
          branchCode: bank.branchCode ?? '',
          routingNumber: bank.routingNumber ?? '',
          swiftCode: bank.swiftCode ?? '',
          iban: bank.iban ?? '',
        })
      }
      setLoading(false)
    }
    if (slug) load()
  }, [slug])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)

    await fetch(`/api/v1/organizations/${orgId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingEmail: form.billingEmail,
        billingDetails: {
          address: {
            line1: form.line1,
            line2: form.line2,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
            country: form.country,
          },
          vatNumber: form.vatNumber,
          registrationNumber: form.registrationNumber,
          phone: form.phone,
          bankingDetails: {
            bankName: form.bankName,
            accountHolder: form.accountHolder,
            accountNumber: form.accountNumber,
            branchCode: form.branchCode,
            routingNumber: form.routingNumber,
            swiftCode: form.swiftCode,
            iban: form.iban,
          },
        },
      }),
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function update(field: keyof BillingForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const inputClass = 'pib-input'

  if (loading) return <div className="pib-skeleton h-96 max-w-3xl mx-auto" />

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
          {orgName} / Settings
        </p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">Billing & Company Details</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Address */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Address</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="pib-label">Street Address</label>
              <input value={form.line1} onChange={e => update('line1', e.target.value)} className={inputClass} placeholder="123 Main Street" />
            </div>
            <div className="col-span-2">
              <label className="pib-label">Address Line 2</label>
              <input value={form.line2} onChange={e => update('line2', e.target.value)} className={inputClass} placeholder="Suite 100 (optional)" />
            </div>
            <div>
              <label className="pib-label">City</label>
              <input value={form.city} onChange={e => update('city', e.target.value)} className={inputClass} placeholder="Cape Town" />
            </div>
            <div>
              <label className="pib-label">State / Province</label>
              <input value={form.state} onChange={e => update('state', e.target.value)} className={inputClass} placeholder="Western Cape" />
            </div>
            <div>
              <label className="pib-label">Postal Code</label>
              <input value={form.postalCode} onChange={e => update('postalCode', e.target.value)} className={inputClass} placeholder="8001" />
            </div>
            <div>
              <label className="pib-label">Country</label>
              <input value={form.country} onChange={e => update('country', e.target.value)} className={inputClass} placeholder="South Africa" />
            </div>
          </div>
        </div>

        {/* Company Details */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Company Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Billing Email</label>
              <input type="email" value={form.billingEmail} onChange={e => update('billingEmail', e.target.value)} className={inputClass} placeholder="billing@company.com" />
            </div>
            <div>
              <label className="pib-label">Phone</label>
              <input value={form.phone} onChange={e => update('phone', e.target.value)} className={inputClass} placeholder="+27 21 000 0000" />
            </div>
            <div>
              <label className="pib-label">VAT Number</label>
              <input value={form.vatNumber} onChange={e => update('vatNumber', e.target.value)} className={inputClass} placeholder="4000000000" />
            </div>
            <div>
              <label className="pib-label">Registration Number</label>
              <input value={form.registrationNumber} onChange={e => update('registrationNumber', e.target.value)} className={inputClass} placeholder="2020/000000/07" />
            </div>
          </div>
        </div>

        {/* Banking Details */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Banking Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Bank Name</label>
              <input value={form.bankName} onChange={e => update('bankName', e.target.value)} className={inputClass} placeholder="FNB" />
            </div>
            <div>
              <label className="pib-label">Account Holder</label>
              <input value={form.accountHolder} onChange={e => update('accountHolder', e.target.value)} className={inputClass} placeholder="Partners in Biz (Pty) Ltd" />
            </div>
            <div>
              <label className="pib-label">Account Number</label>
              <input value={form.accountNumber} onChange={e => update('accountNumber', e.target.value)} className={inputClass} placeholder="62000000000" />
            </div>
            <div>
              <label className="pib-label">Branch Code</label>
              <input value={form.branchCode} onChange={e => update('branchCode', e.target.value)} className={inputClass} placeholder="250655" />
            </div>
            <div>
              <label className="pib-label">SWIFT Code</label>
              <input value={form.swiftCode} onChange={e => update('swiftCode', e.target.value)} className={inputClass} placeholder="FIRNZAJJ (optional)" />
            </div>
            <div>
              <label className="pib-label">IBAN</label>
              <input value={form.iban} onChange={e => update('iban', e.target.value)} className={inputClass} placeholder="Optional" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <button type="submit" disabled={saving} className="pib-btn-primary font-label">
            {saving ? 'Saving…' : 'Save Details'}
          </button>
          {saved && <span className="text-sm text-green-400">Saved successfully</span>}
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Verify files compile**

Run: `cd partnersinbiz-web && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add partnersinbiz-web/lib/organizations/types.ts partnersinbiz-web/app/api/v1/organizations/[id]/route.ts "partnersinbiz-web/app/(admin)/admin/org/[slug]/settings/page.tsx"
git commit -m "feat(orgs): add billing details page with address, VAT, and banking fields"
```

---

## Task 4: Client-Prefixed Invoice Number Generator

**Files:**
- Create: `partnersinbiz-web/lib/invoices/invoice-number.ts`

- [ ] **Step 1: Create the invoice number generator**

```typescript
// lib/invoices/invoice-number.ts
import { adminDb } from '@/lib/firebase/admin'

/**
 * Generate a client-prefixed invoice number.
 * Format: CLI-001 (first 3 letters of client name, uppercase, then sequential number)
 * Example: "Lumen Digital" → LUM-001, LUM-002, etc.
 */
export async function generateInvoiceNumber(orgId: string, clientName: string): Promise<string> {
  // Build prefix from first 3 letters of client name (uppercase, alpha only)
  const alphaOnly = clientName.replace(/[^a-zA-Z]/g, '')
  const prefix = (alphaOnly.length >= 3 ? alphaOnly.slice(0, 3) : alphaOnly.padEnd(3, 'X')).toUpperCase()

  // Count existing invoices for this org to determine next number
  const snapshot = await adminDb
    .collection('invoices')
    .where('orgId', '==', orgId)
    .get()

  const count = snapshot.size + 1
  const number = String(count).padStart(3, '0')

  return `${prefix}-${number}`
}

/**
 * Preview what the next invoice number would be (for UI display).
 */
export async function previewNextInvoiceNumber(orgId: string, clientName: string): Promise<string> {
  return generateInvoiceNumber(orgId, clientName)
}
```

- [ ] **Step 2: Commit**

```bash
git add partnersinbiz-web/lib/invoices/invoice-number.ts
git commit -m "feat(invoicing): add client-prefixed invoice number generator (CLI-001 format)"
```

---

## Task 5: Add Next Invoice Number Preview API

**Files:**
- Create: `partnersinbiz-web/app/api/v1/invoices/next-number/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
// app/api/v1/invoices/next-number/route.ts
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { previewNextInvoiceNumber } from '@/lib/invoices/invoice-number'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  if (!orgId) return apiError('orgId is required', 400)

  // Look up org name
  const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
  if (!orgDoc.exists) return apiError('Organisation not found', 404)
  const orgName = orgDoc.data()?.name ?? 'Unknown'

  const invoiceNumber = await previewNextInvoiceNumber(orgId, orgName)
  return apiSuccess({ invoiceNumber })
})
```

- [ ] **Step 2: Commit**

```bash
git add partnersinbiz-web/app/api/v1/invoices/next-number/route.ts
git commit -m "feat(invoicing): add next-number preview API endpoint"
```

---

## Task 6: Update Invoice Types with Billing Context

**Files:**
- Modify: `partnersinbiz-web/lib/invoices/types.ts`

- [ ] **Step 1: Add billing context fields to Invoice type**

Replace the full contents of `lib/invoices/types.ts`:

```typescript
import type { Timestamp } from 'firebase-admin/firestore'

export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'
export type Currency = 'USD' | 'EUR' | 'ZAR'

export interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface InvoiceAddress {
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode: string
  country: string
}

export interface InvoiceBankingDetails {
  bankName: string
  accountHolder: string
  accountNumber: string
  branchCode?: string
  swiftCode?: string
  iban?: string
}

/** Snapshot of the sender's details at invoice creation time */
export interface InvoiceFromDetails {
  companyName: string
  address?: InvoiceAddress
  email?: string
  phone?: string
  vatNumber?: string
  registrationNumber?: string
  website?: string
  logoUrl?: string
  bankingDetails?: InvoiceBankingDetails
}

/** Snapshot of the client's details at invoice creation time */
export interface InvoiceClientDetails {
  name: string
  address?: InvoiceAddress
  email?: string
  phone?: string
  vatNumber?: string
}

export interface Invoice {
  id?: string
  orgId: string
  invoiceNumber: string
  status: InvoiceStatus
  issueDate: Timestamp | null
  dueDate: Timestamp | null
  lineItems: LineItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  currency: Currency
  notes: string
  paidAt: Timestamp | null
  sentAt: Timestamp | null
  createdBy: string
  /** Snapshot of sender details — frozen at creation */
  fromDetails?: InvoiceFromDetails
  /** Snapshot of client details — frozen at creation */
  clientDetails?: InvoiceClientDetails
  createdAt?: unknown
  updatedAt?: unknown
}

export type InvoiceInput = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>
```

- [ ] **Step 2: Commit**

```bash
git add partnersinbiz-web/lib/invoices/types.ts
git commit -m "feat(invoicing): add from/client details snapshots to Invoice type"
```

---

## Task 7: Update Invoice Creation API

**Files:**
- Modify: `partnersinbiz-web/app/api/v1/invoices/route.ts`

- [ ] **Step 1: Update POST handler to use new invoice number format and snapshot billing details**

Replace the entire contents of `app/api/v1/invoices/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateInvoiceNumber } from '@/lib/invoices/invoice-number'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')

  let query = adminDb.collection('invoices').orderBy('createdAt', 'desc') as any
  if (orgId) query = query.where('orgId', '==', orgId)

  const snapshot = await query.limit(50).get()
  const invoices = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
  return apiSuccess(invoices)
})

export const POST = withAuth('admin', async (req, user) => {
  const body = await req.json().catch(() => ({}))
  if (!body.orgId) return apiError('orgId is required', 400)
  if (!body.lineItems?.length) return apiError('At least one line item is required', 400)

  // Fetch client org for name + billing details snapshot
  const clientOrgDoc = await adminDb.collection('organizations').doc(body.orgId).get()
  if (!clientOrgDoc.exists) return apiError('Client organisation not found', 404)
  const clientOrg = clientOrgDoc.data()!
  const clientBilling = clientOrg.billingDetails ?? {}

  // Fetch platform owner org for "from" details
  const platformSnap = await adminDb
    .collection('organizations')
    .where('type', '==', 'platform_owner')
    .limit(1)
    .get()

  let fromDetails: Record<string, any> = { companyName: 'Partners in Biz' }
  if (!platformSnap.empty) {
    const platform = platformSnap.docs[0].data()
    const pb = platform.billingDetails ?? {}
    fromDetails = {
      companyName: platform.name,
      address: pb.address ?? undefined,
      email: platform.billingEmail ?? platform.settings?.notificationEmail ?? undefined,
      phone: pb.phone ?? undefined,
      vatNumber: pb.vatNumber ?? undefined,
      registrationNumber: pb.registrationNumber ?? undefined,
      website: platform.website ?? undefined,
      logoUrl: platform.brandProfile?.logoUrl ?? platform.logoUrl ?? undefined,
      bankingDetails: pb.bankingDetails ?? undefined,
    }
  }

  // Snapshot client details
  const clientDetails = {
    name: clientOrg.name,
    address: clientBilling.address ?? undefined,
    email: clientOrg.billingEmail ?? clientOrg.settings?.notificationEmail ?? undefined,
    phone: clientBilling.phone ?? undefined,
    vatNumber: clientBilling.vatNumber ?? undefined,
  }

  // Generate invoice number: CLI-001 format
  const invoiceNumber = await generateInvoiceNumber(body.orgId, clientOrg.name)

  // Calculate totals
  const lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> = body.lineItems.map((item: any) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    amount: Number(item.quantity) * Number(item.unitPrice),
  }))
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0)
  const taxRate = Number(body.taxRate ?? 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  const doc = {
    orgId: body.orgId,
    invoiceNumber,
    status: 'draft' as const,
    issueDate: FieldValue.serverTimestamp(),
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    total,
    currency: body.currency ?? clientOrg.settings?.currency ?? 'USD',
    notes: body.notes ?? '',
    fromDetails,
    clientDetails,
    paidAt: null,
    sentAt: null,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb.collection('invoices').add(doc)
  return apiSuccess({ id: ref.id, invoiceNumber }, 201)
})
```

- [ ] **Step 2: Commit**

```bash
git add partnersinbiz-web/app/api/v1/invoices/route.ts
git commit -m "feat(invoicing): snapshot billing details on creation, use client-prefixed invoice numbers"
```

---

## Task 8: Update HTML Generator with Full Billing Details

**Files:**
- Modify: `partnersinbiz-web/lib/invoices/html-generator.ts`

- [ ] **Step 1: Rewrite the HTML generator to include from/to addresses and banking details**

Replace the entire contents of `lib/invoices/html-generator.ts`:

```typescript
import type { Currency } from './types'

function formatCurrency(amount: number, currency: Currency): string {
  const locales: Record<Currency, string> = { USD: 'en-US', EUR: 'de-DE', ZAR: 'en-ZA' }
  return new Intl.NumberFormat(locales[currency] || 'en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(ts: any): string {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatAddress(addr: any): string {
  if (!addr) return ''
  const parts = [addr.line1, addr.line2, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean)
  return parts.join('<br>')
}

/**
 * Generate a print-friendly HTML invoice
 */
export function generateInvoiceHtml(invoice: any): string {
  const currency = (invoice.currency || 'USD') as Currency
  const from = invoice.fromDetails ?? { companyName: 'Partners in Biz' }
  const client = invoice.clientDetails ?? { name: invoice.orgId }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${invoice.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1f2937; background: white; padding: 0; margin: 0;
    }
    @media print {
      body { padding: 0; margin: 0; }
      .no-print { display: none !important; }
      .invoice-container { padding: 0; }
    }
    .invoice-container { max-width: 850px; margin: 0 auto; padding: 40px; background: white; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #f3f4f6; padding-bottom: 30px; }
    .logo-section { flex: 1; }
    .logo-section img { max-height: 50px; margin-bottom: 10px; }
    .company-name { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 5px; }
    .company-detail { font-size: 12px; color: #6b7280; line-height: 1.6; }
    .invoice-meta { text-align: right; }
    .invoice-number { font-size: 28px; font-weight: 700; color: #059669; margin-bottom: 15px; }
    .meta-row { font-size: 13px; color: #6b7280; margin-bottom: 4px; }
    .addresses { display: flex; gap: 40px; margin-bottom: 40px; }
    .address-block { flex: 1; }
    .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 8px; }
    .address-name { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px; }
    .address-detail { font-size: 12px; color: #6b7280; line-height: 1.6; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .items-table thead { border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
    .items-table th { padding: 12px 0; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
    .items-table th.amount { text-align: right; }
    .items-table td { padding: 14px 0; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; }
    .items-table td.amount { text-align: right; font-weight: 600; color: #111827; }
    .items-table tbody tr:last-child td { border-bottom: 1px solid #e5e7eb; }
    .totals-section { display: flex; justify-content: flex-end; margin-bottom: 40px; }
    .totals { width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 13px; color: #6b7280; }
    .total-row.subtotal { border-bottom: 1px solid #e5e7eb; }
    .total-row.tax { border-bottom: 1px solid #e5e7eb; }
    .total-row.final { padding: 15px 0; padding-top: 12px; border-top: 2px solid #e5e7eb; font-size: 16px; font-weight: 700; color: #111827; }
    .total-amount { color: #059669; font-weight: 700; }
    .notes-section { margin-bottom: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; }
    .notes-text { font-size: 13px; color: #6b7280; line-height: 1.6; }
    .banking-section { margin-bottom: 40px; padding: 20px; background: #f9fafb; border-radius: 8px; }
    .banking-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-top: 10px; }
    .banking-row { font-size: 12px; }
    .banking-label { color: #6b7280; }
    .banking-value { color: #111827; font-weight: 500; }
    .footer { text-align: center; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        ${from.logoUrl ? `<img src="${from.logoUrl}" alt="Logo">` : ''}
        <div class="company-name">${from.companyName}</div>
        ${from.website ? `<div class="company-detail">${from.website}</div>` : ''}
        ${from.email ? `<div class="company-detail">${from.email}</div>` : ''}
        ${from.phone ? `<div class="company-detail">${from.phone}</div>` : ''}
        ${from.vatNumber ? `<div class="company-detail">VAT: ${from.vatNumber}</div>` : ''}
        ${from.registrationNumber ? `<div class="company-detail">Reg: ${from.registrationNumber}</div>` : ''}
      </div>
      <div class="invoice-meta">
        <div class="invoice-number">${invoice.invoiceNumber}</div>
        <div class="meta-row"><strong>Issued:</strong> ${formatDate(invoice.issueDate)}</div>
        <div class="meta-row"><strong>Due:</strong> ${formatDate(invoice.dueDate)}</div>
      </div>
    </div>

    <!-- Addresses -->
    <div class="addresses">
      <div class="address-block">
        <div class="section-label">From</div>
        <div class="address-name">${from.companyName}</div>
        ${from.address ? `<div class="address-detail">${formatAddress(from.address)}</div>` : ''}
      </div>
      <div class="address-block">
        <div class="section-label">Bill To</div>
        <div class="address-name">${client.name}</div>
        ${client.address ? `<div class="address-detail">${formatAddress(client.address)}</div>` : ''}
        ${client.email ? `<div class="address-detail">${client.email}</div>` : ''}
        ${client.vatNumber ? `<div class="address-detail">VAT: ${client.vatNumber}</div>` : ''}
      </div>
    </div>

    <!-- Line Items -->
    <div class="line-items">
      <table class="items-table">
        <thead>
          <tr>
            <th style="text-align: left; width: 50%;">Description</th>
            <th style="text-align: center; width: 15%;">Qty</th>
            <th style="text-align: right; width: 17.5%;">Unit Price</th>
            <th class="amount" style="width: 17.5%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.lineItems
            .map(
              (item: any) => `
            <tr>
              <td>${item.description}</td>
              <td style="text-align: center;">${item.quantity}</td>
              <td style="text-align: right;">${formatCurrency(item.unitPrice, currency)}</td>
              <td class="amount">${formatCurrency(item.amount, currency)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-section">
      <div class="totals">
        <div class="total-row subtotal">
          <span>Subtotal</span>
          <span>${formatCurrency(invoice.subtotal, currency)}</span>
        </div>
        ${
          invoice.taxRate > 0
            ? `
        <div class="total-row tax">
          <span>Tax (${invoice.taxRate}%)</span>
          <span>${formatCurrency(invoice.taxAmount, currency)}</span>
        </div>
        `
            : ''
        }
        <div class="total-row final">
          <span>Total</span>
          <span class="total-amount">${formatCurrency(invoice.total, currency)}</span>
        </div>
      </div>
    </div>

    <!-- Notes -->
    ${
      invoice.notes
        ? `
    <div class="notes-section">
      <div class="section-label">Notes / Terms</div>
      <div class="notes-text">${invoice.notes}</div>
    </div>
    `
        : ''
    }

    <!-- Banking Details -->
    ${
      from.bankingDetails?.bankName
        ? `
    <div class="banking-section">
      <div class="section-label">Banking Details</div>
      <div class="banking-grid">
        <div class="banking-row"><span class="banking-label">Bank:</span> <span class="banking-value">${from.bankingDetails.bankName}</span></div>
        <div class="banking-row"><span class="banking-label">Account Holder:</span> <span class="banking-value">${from.bankingDetails.accountHolder}</span></div>
        <div class="banking-row"><span class="banking-label">Account Number:</span> <span class="banking-value">${from.bankingDetails.accountNumber}</span></div>
        ${from.bankingDetails.branchCode ? `<div class="banking-row"><span class="banking-label">Branch Code:</span> <span class="banking-value">${from.bankingDetails.branchCode}</span></div>` : ''}
        ${from.bankingDetails.swiftCode ? `<div class="banking-row"><span class="banking-label">SWIFT:</span> <span class="banking-value">${from.bankingDetails.swiftCode}</span></div>` : ''}
        ${from.bankingDetails.iban ? `<div class="banking-row"><span class="banking-label">IBAN:</span> <span class="banking-value">${from.bankingDetails.iban}</span></div>` : ''}
      </div>
    </div>
    `
        : ''
    }

    <!-- Footer -->
    <div class="footer">
      <div>${from.companyName}</div>
      ${from.website ? `<div style="margin-top:4px">${from.website}</div>` : ''}
    </div>
  </div>
</body>
</html>`
}
```

- [ ] **Step 2: Update the PDF route to use new signature**

In `app/api/v1/invoices/[id]/pdf/route.ts`, change line 44 from:

```typescript
    const html = generateInvoiceHtml(invoice, orgName, orgLogo)
```

to:

```typescript
    const html = generateInvoiceHtml(invoice)
```

The function now pulls all details from the invoice's `fromDetails` and `clientDetails` snapshots, so `orgName` and `orgLogo` params are no longer needed. You can also remove the org lookup block (lines 31-40) but keeping it doesn't hurt — it's just unused.

- [ ] **Step 3: Commit**

```bash
git add partnersinbiz-web/lib/invoices/html-generator.ts partnersinbiz-web/app/api/v1/invoices/[id]/pdf/route.ts
git commit -m "feat(invoicing): render from/to addresses and banking details in invoice HTML"
```

---

## Task 9: Overhaul the New Invoice Form (Org Selector + Currency Fix + Preview)

**Files:**
- Modify: `partnersinbiz-web/app/(admin)/admin/invoicing/new/page.tsx`
- Create: `partnersinbiz-web/app/(admin)/admin/invoicing/new/invoice-preview-modal.tsx`

- [ ] **Step 1: Create the invoice preview modal component**

Create `app/(admin)/admin/invoicing/new/invoice-preview-modal.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'

interface InvoicePreviewModalProps {
  html: string
  onClose: () => void
}

export default function InvoicePreviewModal({ html, onClose }: InvoicePreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument
      if (doc) {
        doc.open()
        doc.write(html)
        doc.close()
      }
    }
  }, [html])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Invoice Preview</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-auto p-1">
          <iframe
            ref={iframeRef}
            className="w-full border-0"
            style={{ height: '80vh' }}
            title="Invoice Preview"
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite the new invoice form**

Replace the entire contents of `app/(admin)/admin/invoicing/new/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import InvoicePreviewModal from './invoice-preview-modal'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
}

interface OrgOption {
  id: string
  name: string
  slug: string
  currency?: string
}

type Currency = 'USD' | 'EUR' | 'ZAR'

const CURRENCY_LOCALES: Record<Currency, string> = { USD: 'en-US', EUR: 'de-DE', ZAR: 'en-ZA' }

function fmtCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] || 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function NewInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedOrgId = searchParams.get('orgId') ?? ''

  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [orgId, setOrgId] = useState(preselectedOrgId)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [taxRate, setTaxRate] = useState(0)
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  // Fetch organisations for the dropdown
  useEffect(() => {
    fetch('/api/v1/organizations')
      .then(r => r.json())
      .then(body => {
        const clientOrgs = (body.data ?? [])
          .filter((o: any) => o.type === 'client')
          .map((o: any) => ({ id: o.id, name: o.name, slug: o.slug }))
        setOrgs(clientOrgs)

        // If preselected org, set it and fetch its currency
        if (preselectedOrgId) {
          setOrgId(preselectedOrgId)
        }
      })
  }, [preselectedOrgId])

  // When org changes, fetch its currency setting and next invoice number
  useEffect(() => {
    if (!orgId) {
      setNextInvoiceNumber('')
      return
    }

    // Fetch org details for currency
    fetch(`/api/v1/organizations/${orgId}`)
      .then(r => r.json())
      .then(body => {
        const orgCurrency = body.data?.settings?.currency
        if (orgCurrency) setCurrency(orgCurrency)
      })
      .catch(() => {})

    // Fetch next invoice number
    fetch(`/api/v1/invoices/next-number?orgId=${orgId}`)
      .then(r => r.json())
      .then(body => {
        if (body.data?.invoiceNumber) setNextInvoiceNumber(body.data.invoiceNumber)
      })
      .catch(() => {})
  }, [orgId])

  function addLineItem() {
    setLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }])
  }

  function removeLineItem(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const subtotal = lineItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  async function handlePreview() {
    if (!orgId) return setError('Select a client organisation first')
    if (!lineItems.some(i => i.description && i.unitPrice > 0)) return setError('Add at least one line item')
    setError('')

    // Create a temporary draft via the API to get the full rendered HTML
    // We'll use the PDF endpoint on a temp invoice, or generate client-side
    // For simplicity, we POST as draft then fetch the PDF HTML, then show it
    // But that creates a real invoice. Instead, let's build a preview payload client-side.

    const selectedOrg = orgs.find(o => o.id === orgId)
    const previewInvoice = {
      invoiceNumber: nextInvoiceNumber || 'PREVIEW',
      issueDate: { _seconds: Math.floor(Date.now() / 1000) },
      dueDate: dueDate ? { _seconds: Math.floor(new Date(dueDate).getTime() / 1000) } : null,
      lineItems: lineItems.filter(i => i.description).map(item => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        amount: Number(item.quantity) * Number(item.unitPrice),
      })),
      subtotal,
      taxRate,
      taxAmount,
      total,
      currency,
      notes,
      orgId,
      clientDetails: { name: selectedOrg?.name ?? orgId },
      fromDetails: { companyName: 'Partners in Biz' },
    }

    // Fetch the HTML by hitting a preview endpoint (we'll use the existing generator on the server)
    const res = await fetch('/api/v1/invoices/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(previewInvoice),
    })

    if (res.ok) {
      const html = await res.text()
      setPreviewHtml(html)
      setShowPreview(true)
    } else {
      setError('Failed to generate preview')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return setError('Select a client organisation')
    if (!lineItems.some(i => i.description && i.unitPrice > 0)) return setError('Add at least one line item')

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, currency, taxRate, notes, dueDate: dueDate || null, lineItems }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to create invoice')
      router.push(`/admin/invoicing/${body.data.id}`)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  const inputClass = 'pib-input'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Invoicing / New</p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">New Invoice</h1>
        {nextInvoiceNumber && (
          <p className="text-sm text-on-surface-variant mt-1">
            Invoice #: <span className="font-mono text-on-surface">{nextInvoiceNumber}</span>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Client + meta */}
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Invoice Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Client Organisation *</label>
              <select
                value={orgId}
                onChange={e => setOrgId(e.target.value)}
                className="pib-select"
              >
                <option value="">Select organisation…</option>
                {orgs.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="pib-label">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className="pib-select">
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="ZAR">ZAR (R)</option>
              </select>
            </div>
            <div>
              <label className="pib-label">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="pib-label">Tax Rate (%)</label>
              <input type="number" min="0" max="100" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="pib-card space-y-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Line Items</p>
          <div className="grid grid-cols-12 gap-2 text-[9px] font-label uppercase tracking-widest text-on-surface-variant">
            <span className="col-span-6">Description</span>
            <span className="col-span-2">Qty</span>
            <span className="col-span-2">Unit Price</span>
            <span className="col-span-2">Amount</span>
          </div>
          {lineItems.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <input value={item.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} className={`col-span-6 ${inputClass}`} placeholder="Description" />
              <input type="number" min="1" value={item.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} className={`col-span-2 ${inputClass}`} />
              <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateLineItem(idx, 'unitPrice', e.target.value)} className={`col-span-2 ${inputClass}`} />
              <div className="col-span-1 text-sm text-on-surface">{fmtCurrency(Number(item.quantity) * Number(item.unitPrice), currency)}</div>
              <button type="button" onClick={() => removeLineItem(idx)} className="col-span-1 text-on-surface-variant hover:text-red-400 transition-colors text-lg leading-none">×</button>
            </div>
          ))}
          <button type="button" onClick={addLineItem} className="pib-btn-secondary text-xs font-label">+ Add Line</button>

          {/* Totals */}
          <div className="border-t border-[var(--color-card-border)] pt-3 space-y-1 text-right">
            <p className="text-sm text-on-surface-variant">Subtotal: <span className="text-on-surface">{fmtCurrency(subtotal, currency)}</span></p>
            {taxRate > 0 && <p className="text-sm text-on-surface-variant">Tax ({taxRate}%): <span className="text-on-surface">{fmtCurrency(taxAmount, currency)}</span></p>}
            <p className="text-base font-bold text-on-surface">Total: {fmtCurrency(total, currency)}</p>
          </div>
        </div>

        {/* Notes */}
        <div className="pib-card">
          <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant block mb-2">Notes / Terms</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="pib-textarea" rows={3} placeholder="Payment terms, thank you note, etc." />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="pib-btn-primary font-label">
            {saving ? 'Creating…' : 'Create Invoice'}
          </button>
          <button type="button" onClick={handlePreview} className="pib-btn-secondary font-label">
            Preview Invoice
          </button>
          <button type="button" onClick={() => router.back()} className="pib-btn-secondary font-label">Cancel</button>
        </div>
      </form>

      {showPreview && (
        <InvoicePreviewModal html={previewHtml} onClose={() => setShowPreview(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "partnersinbiz-web/app/(admin)/admin/invoicing/new/page.tsx" "partnersinbiz-web/app/(admin)/admin/invoicing/new/invoice-preview-modal.tsx"
git commit -m "feat(invoicing): org selector dropdown, currency-aware formatting, live preview modal"
```

---

## Task 10: Invoice Preview API Endpoint

**Files:**
- Create: `partnersinbiz-web/app/api/v1/invoices/preview/route.ts`

- [ ] **Step 1: Create the preview endpoint**

```typescript
// app/api/v1/invoices/preview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { generateInvoiceHtml } from '@/lib/invoices/html-generator'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/invoices/preview
 *
 * Accepts an invoice-like payload and returns rendered HTML for preview.
 * Does NOT create an invoice — purely for preview purposes.
 */
export const POST = withAuth('admin', async (req) => {
  const body = await req.json().catch(() => ({}))

  // If orgId provided, enrich with real org billing data
  let fromDetails = body.fromDetails ?? { companyName: 'Partners in Biz' }
  let clientDetails = body.clientDetails ?? { name: body.orgId ?? 'Client' }

  if (body.orgId) {
    // Fetch client org details
    const clientDoc = await adminDb.collection('organizations').doc(body.orgId).get()
    if (clientDoc.exists) {
      const clientOrg = clientDoc.data()!
      const cb = clientOrg.billingDetails ?? {}
      clientDetails = {
        name: clientOrg.name,
        address: cb.address ?? undefined,
        email: clientOrg.billingEmail ?? clientOrg.settings?.notificationEmail ?? undefined,
        vatNumber: cb.vatNumber ?? undefined,
      }
    }

    // Fetch platform owner details
    const platformSnap = await adminDb
      .collection('organizations')
      .where('type', '==', 'platform_owner')
      .limit(1)
      .get()

    if (!platformSnap.empty) {
      const platform = platformSnap.docs[0].data()
      const pb = platform.billingDetails ?? {}
      fromDetails = {
        companyName: platform.name,
        address: pb.address ?? undefined,
        email: platform.billingEmail ?? platform.settings?.notificationEmail ?? undefined,
        phone: pb.phone ?? undefined,
        vatNumber: pb.vatNumber ?? undefined,
        registrationNumber: pb.registrationNumber ?? undefined,
        website: platform.website ?? undefined,
        logoUrl: platform.brandProfile?.logoUrl ?? platform.logoUrl ?? undefined,
        bankingDetails: pb.bankingDetails ?? undefined,
      }
    }
  }

  const invoice = {
    ...body,
    fromDetails,
    clientDetails,
  }

  const html = generateInvoiceHtml(invoice)

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add partnersinbiz-web/app/api/v1/invoices/preview/route.ts
git commit -m "feat(invoicing): add preview API endpoint for rendering invoice HTML without saving"
```

---

## Task 11: Fix Hardcoded Dollar Signs in Invoice Detail Page

**Files:**
- Modify: `partnersinbiz-web/app/(admin)/admin/invoicing/[id]/page.tsx`

- [ ] **Step 1: Add currency formatter and replace all hardcoded `$` signs**

At the top of the file, after the imports, add the formatter:

```typescript
const CURRENCY_LOCALES: Record<string, string> = { USD: 'en-US', EUR: 'de-DE', ZAR: 'en-ZA' }

function formatCurrencyValue(amount: number, currency: string): string {
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] || 'en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
```

Then replace these hardcoded dollar signs:

**Line 139** — change:
```tsx
<p className="col-span-2 text-right text-sm text-on-surface-variant">${item.unitPrice.toFixed(2)}</p>
```
to:
```tsx
<p className="col-span-2 text-right text-sm text-on-surface-variant">{formatCurrencyValue(item.unitPrice, invoice.currency)}</p>
```

**Line 140** — change:
```tsx
<p className="col-span-2 text-right text-sm font-medium text-on-surface">${item.amount.toFixed(2)}</p>
```
to:
```tsx
<p className="col-span-2 text-right text-sm font-medium text-on-surface">{formatCurrencyValue(item.amount, invoice.currency)}</p>
```

**Line 149** — change:
```tsx
<span>Subtotal</span><span>${invoice.subtotal?.toFixed(2)}</span>
```
to:
```tsx
<span>Subtotal</span><span>{formatCurrencyValue(invoice.subtotal ?? 0, invoice.currency)}</span>
```

**Line 152** — change:
```tsx
<span>Tax ({invoice.taxRate}%)</span><span>${invoice.taxAmount?.toFixed(2)}</span>
```
to:
```tsx
<span>Tax ({invoice.taxRate}%)</span><span>{formatCurrencyValue(invoice.taxAmount ?? 0, invoice.currency)}</span>
```

**Line 157** — change:
```tsx
<span style={{ color: 'var(--color-accent-v2)' }}>${invoice.total?.toFixed(2)} {invoice.currency}</span>
```
to:
```tsx
<span style={{ color: 'var(--color-accent-v2)' }}>{formatCurrencyValue(invoice.total ?? 0, invoice.currency)}</span>
```

Also update the "Bill To" section (line 124) to show the client name instead of orgId. Change:
```tsx
<p className="text-sm font-medium text-on-surface">{invoice.orgId}</p>
```
to:
```tsx
<p className="text-sm font-medium text-on-surface">{(invoice as any).clientDetails?.name ?? invoice.orgId}</p>
```

- [ ] **Step 2: Commit**

```bash
git add "partnersinbiz-web/app/(admin)/admin/invoicing/[id]/page.tsx"
git commit -m "fix(invoicing): replace hardcoded dollar signs with locale-aware currency formatting"
```

---

## Task 12: Fix Hardcoded Dollar Signs in Invoice List Page

**Files:**
- Modify: `partnersinbiz-web/app/(admin)/admin/invoicing/page.tsx`

- [ ] **Step 1: Replace hardcoded `$` in stats section**

In the stats section (around lines 82-84), change:

```tsx
<p className="text-2xl font-headline font-bold" style={{ color: 'var(--color-accent-v2)' }}>
  ${totalRevenue.toLocaleString()}
</p>
```
to:
```tsx
<p className="text-2xl font-headline font-bold" style={{ color: 'var(--color-accent-v2)' }}>
  {formatCurrency(totalRevenue, 'ZAR')}
</p>
```

Do the same for `$outstanding` (line 88) and all other `$` references in the stats.

Note: The stats aggregate across orgs so they may mix currencies. For now, default to ZAR since that's the primary operating currency. The `formatCurrency` function from the billing page already exists in this file.

- [ ] **Step 2: Also show client name instead of orgId in the table**

In the table row (line 147), the client column currently shows `inv.orgId`. Change to show the org name. Since the list endpoint doesn't return org names, we need to enrich. The simplest approach: fetch orgs once and build a lookup map.

Add to the component state:

```typescript
const [orgMap, setOrgMap] = useState<Record<string, string>>({})
```

In the useEffect, after fetching invoices, fetch orgs:

```typescript
fetch('/api/v1/organizations')
  .then(r => r.json())
  .then(body => {
    const map: Record<string, string> = {}
    for (const org of body.data ?? []) map[org.id] = org.name
    setOrgMap(map)
  })
```

Then change line 147:
```tsx
<p className="text-sm text-on-surface truncate">{inv.orgId}</p>
```
to:
```tsx
<p className="text-sm text-on-surface truncate">{orgMap[inv.orgId] ?? inv.orgId}</p>
```

- [ ] **Step 3: Commit**

```bash
git add "partnersinbiz-web/app/(admin)/admin/invoicing/page.tsx"
git commit -m "fix(invoicing): use locale currency formatting in list page, show client names"
```

---

## Task 13: Quote Types

**Files:**
- Create: `partnersinbiz-web/lib/quotes/types.ts`

- [ ] **Step 1: Create the Quote type**

```typescript
// lib/quotes/types.ts
import type { Timestamp } from 'firebase-admin/firestore'
import type { Currency, LineItem, InvoiceFromDetails, InvoiceClientDetails } from '@/lib/invoices/types'

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'converted'

export interface Quote {
  id?: string
  orgId: string
  quoteNumber: string
  status: QuoteStatus
  issueDate: Timestamp | null
  validUntil: Timestamp | null
  lineItems: LineItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  currency: Currency
  notes: string
  fromDetails?: InvoiceFromDetails
  clientDetails?: InvoiceClientDetails
  /** If converted, the resulting invoice ID */
  convertedInvoiceId?: string
  sentAt: Timestamp | null
  acceptedAt: Timestamp | null
  createdBy: string
  createdAt?: unknown
  updatedAt?: unknown
}
```

- [ ] **Step 2: Commit**

```bash
git add partnersinbiz-web/lib/quotes/types.ts
git commit -m "feat(quotes): add Quote type definition"
```

---

## Task 14: Quote API Endpoints

**Files:**
- Create: `partnersinbiz-web/app/api/v1/quotes/route.ts`
- Create: `partnersinbiz-web/app/api/v1/quotes/[id]/route.ts`

- [ ] **Step 1: Create the quotes list/create endpoint**

```typescript
// app/api/v1/quotes/route.ts
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')

  let query = adminDb.collection('quotes').orderBy('createdAt', 'desc') as any
  if (orgId) query = query.where('orgId', '==', orgId)

  const snapshot = await query.limit(50).get()
  const quotes = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
  return apiSuccess(quotes)
})

export const POST = withAuth('admin', async (req, user) => {
  const body = await req.json().catch(() => ({}))
  if (!body.orgId) return apiError('orgId is required', 400)
  if (!body.lineItems?.length) return apiError('At least one line item is required', 400)

  // Fetch client org
  const clientOrgDoc = await adminDb.collection('organizations').doc(body.orgId).get()
  if (!clientOrgDoc.exists) return apiError('Client organisation not found', 404)
  const clientOrg = clientOrgDoc.data()!
  const clientBilling = clientOrg.billingDetails ?? {}

  // Fetch platform owner for "from" details
  const platformSnap = await adminDb
    .collection('organizations')
    .where('type', '==', 'platform_owner')
    .limit(1)
    .get()

  let fromDetails: Record<string, any> = { companyName: 'Partners in Biz' }
  if (!platformSnap.empty) {
    const platform = platformSnap.docs[0].data()
    const pb = platform.billingDetails ?? {}
    fromDetails = {
      companyName: platform.name,
      address: pb.address ?? undefined,
      email: platform.billingEmail ?? platform.settings?.notificationEmail ?? undefined,
      phone: pb.phone ?? undefined,
      vatNumber: pb.vatNumber ?? undefined,
      registrationNumber: pb.registrationNumber ?? undefined,
      website: platform.website ?? undefined,
      logoUrl: platform.brandProfile?.logoUrl ?? platform.logoUrl ?? undefined,
      bankingDetails: pb.bankingDetails ?? undefined,
    }
  }

  const clientDetails = {
    name: clientOrg.name,
    address: clientBilling.address ?? undefined,
    email: clientOrg.billingEmail ?? clientOrg.settings?.notificationEmail ?? undefined,
    vatNumber: clientBilling.vatNumber ?? undefined,
  }

  // Generate quote number: Q-CLI-001
  const alphaOnly = clientOrg.name.replace(/[^a-zA-Z]/g, '')
  const prefix = (alphaOnly.length >= 3 ? alphaOnly.slice(0, 3) : alphaOnly.padEnd(3, 'X')).toUpperCase()
  const countSnap = await adminDb.collection('quotes').where('orgId', '==', body.orgId).get()
  const count = countSnap.size + 1
  const quoteNumber = `Q-${prefix}-${String(count).padStart(3, '0')}`

  // Calculate totals
  const lineItems = body.lineItems.map((item: any) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    amount: Number(item.quantity) * Number(item.unitPrice),
  }))
  const subtotal = lineItems.reduce((sum: number, item: any) => sum + item.amount, 0)
  const taxRate = Number(body.taxRate ?? 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  const doc = {
    orgId: body.orgId,
    quoteNumber,
    status: 'draft' as const,
    issueDate: FieldValue.serverTimestamp(),
    validUntil: body.validUntil ? new Date(body.validUntil) : null,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    total,
    currency: body.currency ?? clientOrg.settings?.currency ?? 'USD',
    notes: body.notes ?? '',
    fromDetails,
    clientDetails,
    convertedInvoiceId: null,
    sentAt: null,
    acceptedAt: null,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb.collection('quotes').add(doc)
  return apiSuccess({ id: ref.id, quoteNumber }, 201)
})
```

- [ ] **Step 2: Create the quote detail/update/convert endpoint**

```typescript
// app/api/v1/quotes/[id]/route.ts
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateInvoiceNumber } from '@/lib/invoices/invoice-number'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const doc = await adminDb.collection('quotes').doc(id).get()
  if (!doc.exists) return apiError('Quote not found', 404)
  return apiSuccess({ id: doc.id, ...doc.data() })
})

export const PATCH = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))
  const ref = adminDb.collection('quotes').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Quote not found', 404)
  const quoteData = doc.data()!

  // Handle convert-to-invoice action
  if (body.action === 'convert-to-invoice') {
    if (quoteData.status !== 'accepted') {
      return apiError('Only accepted quotes can be converted to invoices', 400)
    }
    if (quoteData.convertedInvoiceId) {
      return apiError('Quote has already been converted', 400)
    }

    // Fetch client org name for invoice number
    const clientOrgDoc = await adminDb.collection('organizations').doc(quoteData.orgId).get()
    const clientName = clientOrgDoc.exists ? clientOrgDoc.data()!.name : 'Unknown'

    const invoiceNumber = await generateInvoiceNumber(quoteData.orgId, clientName)

    // Create invoice from quote data
    const invoiceDoc = {
      orgId: quoteData.orgId,
      invoiceNumber,
      status: 'draft' as const,
      issueDate: FieldValue.serverTimestamp(),
      dueDate: null,
      lineItems: quoteData.lineItems,
      subtotal: quoteData.subtotal,
      taxRate: quoteData.taxRate,
      taxAmount: quoteData.taxAmount,
      total: quoteData.total,
      currency: quoteData.currency,
      notes: quoteData.notes,
      fromDetails: quoteData.fromDetails,
      clientDetails: quoteData.clientDetails,
      paidAt: null,
      sentAt: null,
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    const invoiceRef = await adminDb.collection('invoices').add(invoiceDoc)

    // Mark quote as converted
    await ref.update({
      status: 'converted',
      convertedInvoiceId: invoiceRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return apiSuccess({ invoiceId: invoiceRef.id, invoiceNumber })
  }

  // Regular status updates
  const updates: Record<string, any> = { ...body, updatedAt: FieldValue.serverTimestamp() }

  if (body.status === 'accepted' && quoteData.status !== 'accepted') {
    updates.acceptedAt = FieldValue.serverTimestamp()
  }
  if (body.status === 'sent' && quoteData.status === 'draft') {
    updates.sentAt = FieldValue.serverTimestamp()
  }

  await ref.update(updates)
  return apiSuccess({ id })
})

export const DELETE = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  await adminDb.collection('quotes').doc(id).delete()
  return apiSuccess({ deleted: true })
})
```

- [ ] **Step 3: Commit**

```bash
git add partnersinbiz-web/app/api/v1/quotes/route.ts partnersinbiz-web/app/api/v1/quotes/[id]/route.ts
git commit -m "feat(quotes): add CRUD API with convert-to-invoice action"
```

---

## Task 15: Quotes List Page

**Files:**
- Create: `partnersinbiz-web/app/(admin)/admin/quotes/page.tsx`

- [ ] **Step 1: Create the quotes list page**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'converted'

interface Quote {
  id: string
  quoteNumber: string
  orgId: string
  status: QuoteStatus
  total: number
  currency: string
  issueDate?: any
  validUntil?: any
  convertedInvoiceId?: string
}

const STATUS_MAP: Record<QuoteStatus, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'var(--color-outline)' },
  sent:      { label: 'Sent',      color: '#60a5fa' },
  accepted:  { label: 'Accepted',  color: '#4ade80' },
  declined:  { label: 'Declined',  color: '#ef4444' },
  expired:   { label: 'Expired',   color: 'var(--color-outline)' },
  converted: { label: 'Converted', color: '#c084fc' },
}

function formatCurrency(amount: number, currency: string) {
  const locales: Record<string, string> = { USD: 'en-US', EUR: 'de-DE', ZAR: 'en-ZA' }
  return new Intl.NumberFormat(locales[currency] || 'en-US', { style: 'currency', currency }).format(amount)
}

function formatDate(ts: any) {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [orgMap, setOrgMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<QuoteStatus | 'all'>('all')

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/quotes').then(r => r.json()),
      fetch('/api/v1/organizations').then(r => r.json()),
    ]).then(([quotesBody, orgsBody]) => {
      setQuotes(quotesBody.data ?? [])
      const map: Record<string, string> = {}
      for (const org of orgsBody.data ?? []) map[org.id] = org.name
      setOrgMap(map)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? quotes : quotes.filter(q => q.status === filter)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Quotes</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">{loading ? '—' : `${quotes.length} quotes`}</p>
        </div>
        <Link href="/admin/quotes/new" className="pib-btn-primary text-sm font-label">+ New Quote</Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'draft', 'sent', 'accepted', 'declined', 'converted'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="text-xs font-label px-3 py-1.5 rounded-[var(--radius-btn)] transition-colors capitalize"
            style={filter === s
              ? { background: 'var(--color-accent-v2)', color: '#000' }
              : { color: 'var(--color-on-surface-variant)' }
            }
          >
            {s === 'all' ? `All (${quotes.length})` : `${s} (${quotes.filter(q => q.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="pib-card overflow-hidden !p-0">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-[var(--color-card-border)]">
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">#</p>
          <p className="col-span-3 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Client</p>
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Status</p>
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Amount</p>
          <p className="col-span-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Valid Until</p>
          <p className="col-span-1 text-[10px] font-label uppercase tracking-widest text-on-surface-variant"></p>
        </div>

        {loading ? (
          <div className="divide-y divide-[var(--color-card-border)]">
            {[1,2,3].map(i => <div key={i} className="px-5 py-4"><div className="pib-skeleton h-5 w-48" /></div>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-on-surface-variant text-sm">No quotes found.</p>
            <Link href="/admin/quotes/new" className="text-sm mt-2 inline-block" style={{ color: 'var(--color-accent-v2)' }}>
              Create your first quote →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-card-border)]">
            {filtered.map(q => {
              const status = STATUS_MAP[q.status] ?? { label: q.status, color: 'var(--color-outline)' }
              return (
                <div key={q.id} className="grid grid-cols-12 gap-4 items-center px-5 py-3 hover:bg-[var(--color-row-hover)] transition-colors">
                  <div className="col-span-2">
                    <p className="text-sm font-mono text-on-surface">{q.quoteNumber}</p>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <p className="text-sm text-on-surface truncate">{orgMap[q.orgId] ?? q.orgId}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${status.color}20`, color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-on-surface">{formatCurrency(q.total ?? 0, q.currency ?? 'USD')}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-on-surface-variant">{formatDate(q.validUntil)}</p>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Link href={`/admin/quotes/${q.id}`} className="text-[10px] font-label uppercase tracking-wide" style={{ color: 'var(--color-accent-v2)' }}>
                      View →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "partnersinbiz-web/app/(admin)/admin/quotes/page.tsx"
git commit -m "feat(quotes): add quotes list page with status filters"
```

---

## Task 16: New Quote Form

**Files:**
- Create: `partnersinbiz-web/app/(admin)/admin/quotes/new/page.tsx`

- [ ] **Step 1: Create the new quote form**

This is structurally identical to the new invoice form but with `validUntil` instead of `dueDate`, and posts to `/api/v1/quotes`.

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import InvoicePreviewModal from '../../invoicing/new/invoice-preview-modal'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
}

interface OrgOption {
  id: string
  name: string
  slug: string
}

type Currency = 'USD' | 'EUR' | 'ZAR'

const CURRENCY_LOCALES: Record<Currency, string> = { USD: 'en-US', EUR: 'de-DE', ZAR: 'en-ZA' }

function fmtCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] || 'en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount)
}

export default function NewQuotePage() {
  const router = useRouter()

  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [orgId, setOrgId] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [taxRate, setTaxRate] = useState(0)
  const [notes, setNotes] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  useEffect(() => {
    fetch('/api/v1/organizations')
      .then(r => r.json())
      .then(body => {
        const clientOrgs = (body.data ?? [])
          .filter((o: any) => o.type === 'client')
          .map((o: any) => ({ id: o.id, name: o.name, slug: o.slug }))
        setOrgs(clientOrgs)
      })
  }, [])

  useEffect(() => {
    if (!orgId) return
    fetch(`/api/v1/organizations/${orgId}`)
      .then(r => r.json())
      .then(body => {
        const orgCurrency = body.data?.settings?.currency
        if (orgCurrency) setCurrency(orgCurrency)
      })
      .catch(() => {})
  }, [orgId])

  function addLineItem() {
    setLineItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }])
  }

  function removeLineItem(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const subtotal = lineItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  async function handlePreview() {
    if (!orgId) return setError('Select a client organisation first')
    setError('')

    const selectedOrg = orgs.find(o => o.id === orgId)
    const res = await fetch('/api/v1/invoices/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceNumber: 'QUOTE PREVIEW',
        issueDate: { _seconds: Math.floor(Date.now() / 1000) },
        dueDate: validUntil ? { _seconds: Math.floor(new Date(validUntil).getTime() / 1000) } : null,
        lineItems: lineItems.filter(i => i.description).map(item => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          amount: Number(item.quantity) * Number(item.unitPrice),
        })),
        subtotal, taxRate, taxAmount, total, currency, notes, orgId,
        clientDetails: { name: selectedOrg?.name ?? orgId },
        fromDetails: { companyName: 'Partners in Biz' },
      }),
    })
    if (res.ok) {
      setPreviewHtml(await res.text())
      setShowPreview(true)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return setError('Select a client organisation')
    if (!lineItems.some(i => i.description && i.unitPrice > 0)) return setError('Add at least one line item')

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/v1/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, currency, taxRate, notes, validUntil: validUntil || null, lineItems }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to create quote')
      router.push(`/admin/quotes/${body.data.id}`)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  const inputClass = 'pib-input'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Quotes / New</p>
        <h1 className="text-2xl font-headline font-bold text-on-surface">New Quote</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="pib-card space-y-4">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Quote Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="pib-label">Client Organisation *</label>
              <select value={orgId} onChange={e => setOrgId(e.target.value)} className="pib-select">
                <option value="">Select organisation…</option>
                {orgs.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="pib-label">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className="pib-select">
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="ZAR">ZAR (R)</option>
              </select>
            </div>
            <div>
              <label className="pib-label">Valid Until</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="pib-label">Tax Rate (%)</label>
              <input type="number" min="0" max="100" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="pib-card space-y-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Line Items</p>
          <div className="grid grid-cols-12 gap-2 text-[9px] font-label uppercase tracking-widest text-on-surface-variant">
            <span className="col-span-6">Description</span>
            <span className="col-span-2">Qty</span>
            <span className="col-span-2">Unit Price</span>
            <span className="col-span-2">Amount</span>
          </div>
          {lineItems.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <input value={item.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} className={`col-span-6 ${inputClass}`} placeholder="Description" />
              <input type="number" min="1" value={item.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} className={`col-span-2 ${inputClass}`} />
              <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateLineItem(idx, 'unitPrice', e.target.value)} className={`col-span-2 ${inputClass}`} />
              <div className="col-span-1 text-sm text-on-surface">{fmtCurrency(Number(item.quantity) * Number(item.unitPrice), currency)}</div>
              <button type="button" onClick={() => removeLineItem(idx)} className="col-span-1 text-on-surface-variant hover:text-red-400 transition-colors text-lg leading-none">×</button>
            </div>
          ))}
          <button type="button" onClick={addLineItem} className="pib-btn-secondary text-xs font-label">+ Add Line</button>

          <div className="border-t border-[var(--color-card-border)] pt-3 space-y-1 text-right">
            <p className="text-sm text-on-surface-variant">Subtotal: <span className="text-on-surface">{fmtCurrency(subtotal, currency)}</span></p>
            {taxRate > 0 && <p className="text-sm text-on-surface-variant">Tax ({taxRate}%): <span className="text-on-surface">{fmtCurrency(taxAmount, currency)}</span></p>}
            <p className="text-base font-bold text-on-surface">Total: {fmtCurrency(total, currency)}</p>
          </div>
        </div>

        <div className="pib-card">
          <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant block mb-2">Notes / Terms</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="pib-textarea" rows={3} placeholder="Payment terms, validity, etc." />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="pib-btn-primary font-label">
            {saving ? 'Creating…' : 'Create Quote'}
          </button>
          <button type="button" onClick={handlePreview} className="pib-btn-secondary font-label">Preview</button>
          <button type="button" onClick={() => router.back()} className="pib-btn-secondary font-label">Cancel</button>
        </div>
      </form>

      {showPreview && <InvoicePreviewModal html={previewHtml} onClose={() => setShowPreview(false)} />}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "partnersinbiz-web/app/(admin)/admin/quotes/new/page.tsx"
git commit -m "feat(quotes): add new quote form with org selector, currency formatting, preview"
```

---

## Task 17: Quote Detail Page with Convert-to-Invoice

**Files:**
- Create: `partnersinbiz-web/app/(admin)/admin/quotes/[id]/page.tsx`

- [ ] **Step 1: Create the quote detail page**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'converted'

interface Quote {
  id: string
  quoteNumber: string
  orgId: string
  status: QuoteStatus
  total: number
  subtotal: number
  taxRate: number
  taxAmount: number
  currency: string
  lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[]
  notes?: string
  issueDate?: any
  validUntil?: any
  clientDetails?: { name: string }
  convertedInvoiceId?: string
}

const STATUS_MAP: Record<QuoteStatus, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'var(--color-outline)' },
  sent:      { label: 'Sent',      color: '#60a5fa' },
  accepted:  { label: 'Accepted',  color: '#4ade80' },
  declined:  { label: 'Declined',  color: '#ef4444' },
  expired:   { label: 'Expired',   color: 'var(--color-outline)' },
  converted: { label: 'Converted', color: '#c084fc' },
}

const CURRENCY_LOCALES: Record<string, string> = { USD: 'en-US', EUR: 'de-DE', ZAR: 'en-ZA' }

function fmtCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] || 'en-US', {
    style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(ts: any) {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function QuoteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    fetch(`/api/v1/quotes/${id}`)
      .then(r => r.json())
      .then(body => { setQuote(body.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  async function updateStatus(status: QuoteStatus) {
    if (!quote) return
    setUpdating(true)
    const res = await fetch(`/api/v1/quotes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) setQuote(prev => prev ? { ...prev, status } : prev)
    setUpdating(false)
  }

  async function convertToInvoice() {
    if (!quote) return
    setConverting(true)
    const res = await fetch(`/api/v1/quotes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'convert-to-invoice' }),
    })
    if (res.ok) {
      const body = await res.json()
      router.push(`/admin/invoicing/${body.data.invoiceId}`)
    }
    setConverting(false)
  }

  if (loading) return <div className="space-y-4"><div className="pib-skeleton h-12 w-64" /><div className="pib-skeleton h-96" /></div>
  if (!quote) return <div className="pib-card py-12 text-center"><p className="text-on-surface-variant">Quote not found.</p></div>

  const status = STATUS_MAP[quote.status]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/quotes" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">← Quotes</Link>
          <h1 className="text-2xl font-headline font-bold text-on-surface mt-1">{quote.quoteNumber}</h1>
        </div>
        <span className="text-[10px] font-label uppercase tracking-wide px-2 py-1 rounded-full" style={{ background: `${status.color}20`, color: status.color }}>
          {status.label}
        </span>
      </div>

      {/* Quote card */}
      <div className="pib-card space-y-6">
        <div className="flex justify-between">
          <div>
            <p className="text-lg font-headline font-bold text-on-surface">Partners in Biz</p>
            <p className="text-sm text-on-surface-variant">partnersinbiz.online</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-headline font-bold" style={{ color: 'var(--color-accent-v2)' }}>{quote.quoteNumber}</p>
            <p className="text-xs text-on-surface-variant mt-1">Issued: {formatDate(quote.issueDate)}</p>
            <p className="text-xs text-on-surface-variant">Valid Until: {formatDate(quote.validUntil)}</p>
          </div>
        </div>

        <div className="border-t border-[var(--color-card-border)] pt-4">
          <p className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Quote For</p>
          <p className="text-sm font-medium text-on-surface">{quote.clientDetails?.name ?? quote.orgId}</p>
        </div>

        {/* Line items */}
        <div>
          <div className="grid grid-cols-12 gap-2 pb-2 border-b border-[var(--color-card-border)]">
            <p className="col-span-6 text-[9px] font-label uppercase tracking-widest text-on-surface-variant">Description</p>
            <p className="col-span-2 text-right text-[9px] font-label uppercase tracking-widest text-on-surface-variant">Qty</p>
            <p className="col-span-2 text-right text-[9px] font-label uppercase tracking-widest text-on-surface-variant">Unit</p>
            <p className="col-span-2 text-right text-[9px] font-label uppercase tracking-widest text-on-surface-variant">Amount</p>
          </div>
          {quote.lineItems.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-[var(--color-card-border)]/50">
              <p className="col-span-6 text-sm text-on-surface">{item.description}</p>
              <p className="col-span-2 text-right text-sm text-on-surface-variant">{item.quantity}</p>
              <p className="col-span-2 text-right text-sm text-on-surface-variant">{fmtCurrency(item.unitPrice, quote.currency)}</p>
              <p className="col-span-2 text-right text-sm font-medium text-on-surface">{fmtCurrency(item.amount, quote.currency)}</p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="space-y-1 min-w-48">
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span>Subtotal</span><span>{fmtCurrency(quote.subtotal ?? 0, quote.currency)}</span>
            </div>
            {quote.taxRate > 0 && (
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>Tax ({quote.taxRate}%)</span><span>{fmtCurrency(quote.taxAmount ?? 0, quote.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-on-surface pt-1 border-t border-[var(--color-card-border)]">
              <span>Total</span>
              <span style={{ color: 'var(--color-accent-v2)' }}>{fmtCurrency(quote.total ?? 0, quote.currency)}</span>
            </div>
          </div>
        </div>

        {quote.notes && (
          <div className="border-t border-[var(--color-card-border)] pt-4">
            <p className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Notes</p>
            <p className="text-sm text-on-surface-variant">{quote.notes}</p>
          </div>
        )}
      </div>

      {/* Converted banner */}
      {quote.status === 'converted' && quote.convertedInvoiceId && (
        <div className="pib-card bg-purple-500/10 border-purple-500/20">
          <p className="text-sm text-on-surface">
            This quote was converted to an invoice.{' '}
            <Link href={`/admin/invoicing/${quote.convertedInvoiceId}`} style={{ color: 'var(--color-accent-v2)' }}>
              View Invoice →
            </Link>
          </p>
        </div>
      )}

      {/* Actions */}
      {!['converted', 'declined', 'expired'].includes(quote.status) && (
        <div className="flex gap-2 flex-wrap">
          {quote.status === 'draft' && (
            <button onClick={() => updateStatus('sent')} disabled={updating} className="pib-btn-primary font-label">
              Mark as Sent
            </button>
          )}
          {quote.status === 'sent' && (
            <>
              <button onClick={() => updateStatus('accepted')} disabled={updating} className="pib-btn-primary font-label">
                Mark as Accepted
              </button>
              <button onClick={() => updateStatus('declined')} disabled={updating} className="pib-btn-secondary font-label text-sm">
                Mark as Declined
              </button>
            </>
          )}
          {quote.status === 'accepted' && !quote.convertedInvoiceId && (
            <button onClick={convertToInvoice} disabled={converting} className="pib-btn-primary font-label">
              {converting ? 'Converting…' : 'Convert to Invoice'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "partnersinbiz-web/app/(admin)/admin/quotes/[id]/page.tsx"
git commit -m "feat(quotes): add quote detail page with status management and convert-to-invoice"
```

---

## Task 18: Add Quotes Navigation Link

**Files:**
- Find and modify the admin sidebar/navigation component to include a "Quotes" link alongside "Invoicing"

- [ ] **Step 1: Find the admin navigation component**

Run: `grep -r "invoicing" partnersinbiz-web/app --include="*.tsx" -l` to find where the invoicing nav link lives, then add a Quotes link next to it.

Look for the admin layout or sidebar component. Add a navigation item:
```tsx
{ label: 'Quotes', href: '/admin/quotes', icon: '📋' },
```

Place it near the Invoicing navigation item.

- [ ] **Step 2: Also add a "Settings" link in the org workspace sidebar**

Find the org workspace navigation and add:
```tsx
{ label: 'Settings', href: `/admin/org/${slug}/settings` },
```

- [ ] **Step 3: Commit**

```bash
git add -A  # stage navigation changes
git commit -m "feat(nav): add Quotes and Org Settings navigation links"
```

---

## Summary of Changes

| Feature | What Changed |
|---------|-------------|
| **Org Selector** | New invoice form uses a `<select>` dropdown populated from `/api/v1/organizations` instead of a text input |
| **Currency Fix** | All hardcoded `$` replaced with `Intl.NumberFormat` using locale-appropriate formatting (ZAR shows `R`, EUR shows `€`) |
| **Invoice Preview** | "Preview Invoice" button renders the full invoice HTML in an iframe modal before creating |
| **Billing Details** | New `BillingDetails` type on Organization; new org settings page at `/admin/org/[slug]/settings` for address, VAT, banking |
| **From/To on Invoice** | Invoice creation snapshots sender's and client's billing details; HTML generator renders both addresses + banking details |
| **Invoice Numbers** | Changed from `PIB-YYYY-NNN` to `CLI-001` format (first 3 letters of client name + per-client sequential count) |
| **Quotes** | Full quote system: types, CRUD API, list page, create form, detail page with accept/decline/convert-to-invoice workflow |
| **Quote Numbers** | Format: `Q-CLI-001` (prefixed with Q-) |
