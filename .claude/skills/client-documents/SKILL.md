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
