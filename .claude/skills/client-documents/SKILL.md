---
name: client-documents
description: Create, review, publish, and track client-facing PiB documents including proposals, specs, social strategies, content campaign plans, reports, launch sign-offs, and change requests.
---

# Client Documents

Use this whenever Peet asks for a proposal, spec, strategy document, sign-off, report, change request, approval pack, or any client-facing document.

## Source of Truth

Documents live in the Partners in Biz platform as `client_documents`. They are the collaboration and approval layer. Projects, campaigns, CRM deals, reports, SEO sprints, and social posts remain the operational source of truth and are linked through `document.linked`.

## Default Workflow

1. Resolve the client org.
2. Choose the right template:
   - Sales Proposal -> `sales_proposal`
   - Website/App Build Spec -> `build_spec`
   - Social Media Strategy -> `social_strategy`
   - Content Campaign Plan -> `content_campaign_plan`
   - Monthly Report -> `monthly_report`
   - Launch Sign-off -> `launch_signoff`
   - Change Request -> `change_request`
3. Pull context from org profile, brand profile, wiki, projects, campaigns, reports, CRM deals, SEO sprints, and social records.
4. Create an internal draft through `POST /api/v1/client-documents`.
5. Create or update draft versions through `POST /api/v1/client-documents/[id]/versions`.
6. Mark assumptions inside `assumptions[]`.
7. Keep formal acceptance documents internal until price, legal terms, dates, and scope are resolved.
8. Publish only when the template rules allow it.
9. Return admin and client URLs.

## Assumptions

Draft with visible assumptions when context is incomplete. Use `severity: blocks_publish` for price, legal terms, binding dates, and final scope. Use `needs_review` for positioning, wording, references, and low-risk scope details.

## Publishing

Use `POST /api/v1/client-documents/[id]/publish` only after blocking assumptions are resolved and the document has an `orgId`. Publishing moves the document into client review and enables the share token.

## Collaboration

Clients can leave inline comments and suggestions on accessible documents. Internal users or agents resolve suggestions. Do not mutate approved versions; create a new version when the scope or copy changes after approval.

## Approval

Operational approvals are for specs, reports, launch sign-offs, and change requests. Formal acceptance is for sales proposals and SOW-like documents. Formal acceptance requires typed name, checkbox text, and the current terms/investment snapshot.

## Agent Command: Make a Proposal

When Peet says "make a proposal for [Client X]" or "create a spec for [Client X]" or similar:

1. Resolve the client org: call `GET /api/v1/organizations` and find the org by name/slug.
2. Pull context: org profile, any open CRM deals (`GET /api/v1/crm/contacts`), existing projects (`GET /api/v1/projects`), campaigns, and anything in the wiki at `~/Cowork/Cowork/agents/partners/wiki/`.
3. Choose the template based on what Peet asked for (proposal → sales_proposal, website/app → build_spec, etc.).
4. Create the document:
   ```
   POST /api/v1/client-documents
   {
     "title": "[Client Name] — [Document Type] [Month Year]",
     "type": "<template_type>",
     "templateId": "<template_type>",
     "orgId": "<org_id>",
     "linked": { "dealId": "<deal_id_if_known>" }
   }
   ```
5. Create the first draft version with filled blocks:
   ```
   POST /api/v1/client-documents/[id]/versions
   {
     "blocks": [ ... filled block array ... ],
     "theme": { "brandName": "<org_name>", "palette": { "bg": "#0A0A0B", "text": "#F7F4EE", "accent": "#F5A623" }, "typography": { "heading": "sans-serif", "body": "sans-serif" } },
     "changeSummary": "Initial agent-generated draft"
   }
   ```
6. Mark open assumptions: include "assumptions" in the PATCH to `/api/v1/client-documents/[id]` for any unknown price, scope, dates, or legal terms.
7. Return:
   - Admin review URL: `https://partnersinbiz.online/admin/documents/[id]`
   - Client share URL: `https://partnersinbiz.online/d/[shareToken]` (only usable after publish)
   - Summary of assumptions that need resolution before publishing

Always draft first. Never publish without Peet's explicit instruction.
