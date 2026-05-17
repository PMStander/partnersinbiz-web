# Meta App Review submission — `ads_management`

This doc walks through what Peet needs to submit to Meta to get the `ads_management` permission approved for Live mode of the PiB Meta app (App ID `133722058771742`).

## Lead time

Typical Meta App Review for ads scopes: **1-3 weeks**. Submit early.

## What gets approved

The PiB Meta app currently has these scopes pending or granted:
- `ads_management` — write access to campaigns/adsets/ads/creatives/audiences
- `ads_read` — read insights (lighter scope)
- `business_management` — read business assets (ad accounts, pixels)
- `pages_read_engagement` — Engagement Custom Audiences

All four need approval before the app can flip to Live mode.

## Pre-submission checklist

- [ ] App is in Development mode in Meta App Dashboard
- [ ] Redirect URI is registered: `https://partnersinbiz.online/api/v1/ads/connections/meta/callback` and `http://localhost:3000/api/v1/ads/connections/meta/callback`
- [ ] Business verification complete in Meta Business Manager (status: Approved)
- [ ] Data Access Renewal in good standing (deadline tracker in [[meta-app-setup]])
- [ ] Test User (or real Meta account) granted Test User access in Meta App Dashboard
- [ ] PiB Vercel deploy is reachable from public internet (Meta reviewers need to access it)

## Screencast — what to record

Goal: show Meta reviewers the full end-to-end flow that needs each requested permission.

Recommended length: 3-5 minutes. Use Loom or QuickTime.

### Step 1 — connect (`ads_management` + `business_management`)
1. Log into `https://partnersinbiz.online` as admin
2. Navigate to `Admin → Org → <test client> → Ads → Connections`
3. Click **Connect Meta**
4. Show the Meta OAuth dialog — reviewer sees what scopes are requested
5. Approve in the dialog
6. Show the connection page after redirect: list of ad accounts pulled from `business_management`
7. Pick a default ad account

### Step 2 — create a campaign (`ads_management`)
1. Navigate to `Ads → Campaigns`
2. Click **New campaign**
3. Run through the 3-step wizard: Campaign (Traffic objective, $1 daily budget) → AdSet (US/UK, 25-54, feeds+stories) → Ad (paste a public image URL, simple copy)
4. Click **Create campaign (as draft)**
5. Show the campaign detail page with ad-set + ad nested

### Step 3 — launch + pause (`ads_management`)
1. From campaign detail, click **Launch** — note the campaign goes to PAUSED in Meta (PiB defaults Test User runs to PAUSED — no actual spend)
2. Show the Meta-side ID in the detail page after launch
3. Click **Pause** — show status flip
4. Click **Delete** — confirm + show it's archived in Meta

### Step 4 — Custom Audiences (`ads_management`)
1. Navigate to `Ads → Audiences`
2. Click **New audience**
3. Pick **Customer list** type
4. Upload a tiny test CSV (e.g. `email\ntest1@example.com\ntest2@example.com`)
5. Map the EMAIL column
6. Click **Create audience**
7. Show the audience appears in the list with BUILDING status
8. Click **Refresh size** — show it becomes READY or TOO_SMALL

### Step 5 — Pixel + CAPI (`ads_management`)
1. Navigate to `Ads → Pixel & CAPI`
2. Click **New pixel config**
3. Paste a test Pixel ID + CAPI access token
4. Save
5. Paste a `test_event_code` from Meta Events Manager → Test Events
6. Click **Send test event**
7. Open Meta Events Manager → Test Events tab in another window — show the event arrives

### Step 6 — Engagement audience (`pages_read_engagement`)
1. Navigate to `Ads → Audiences → New`
2. Pick **Engagement** type
3. Pick PAGE engagement source + paste a Facebook Page ID
4. Set lookback to 60 days
5. Click **Create audience**

## Reviewer instructions text

Paste this into Meta App Dashboard's "Tell us how you're using this permission" field:

```
Partners in Biz (https://partnersinbiz.online) is an agency platform that
manages paid ad campaigns on Meta for our clients. Admins log into our
internal dashboard and use the Ads module to:

1. Connect a Meta ad account via Login for Business (business_management).
2. Create + launch + pause + delete Meta campaigns, ad sets, and ads
   (ads_management).
3. Build custom audiences from customer lists (hashed client-side), website
   pixel rules, lookalikes, app events, and engagement (ads_management +
   pages_read_engagement for Engagement audiences).
4. Send server-side conversion events via Conversion API to improve
   attribution beyond browser pixel (ads_management for Pixel config).
5. Pull daily insights for cost/clicks/impressions/conversions reporting
   (ads_read).

Test user credentials and screencast attached. All campaigns in the screencast
launch in PAUSED status to avoid actual ad spend during review.
```

## Test User setup

In Meta App Dashboard → Roles → Test Users:
1. Click **Add Test User**
2. Set name (e.g. "PiB Reviewer")
3. Generate password — save it
4. Grant the test user a small Meta Business + an Ad Account with $1 test budget
5. Hand Meta reviewers these credentials in the review submission form

## Common rejection reasons + fixes

- **"Permission overreach"** — Make sure the screencast shows each scope being used. Don't request scopes you don't demo.
- **"Test user can't access app"** — Add the test user under Roles → Testers in App Dashboard.
- **"Cannot complete flow"** — Ensure Vercel prod is up and the redirect URI matches what's registered exactly (trailing slash matters).
- **"Data usage unclear"** — Add a Privacy Policy URL in App Dashboard pointing to https://partnersinbiz.online/privacy. Make sure it explains CAPI / hashing.

## After submission

Track status in Meta App Dashboard → App Review → Permissions. Status moves through: Submitted → In Review → Approved | Rejected. If rejected, the rejection email lists which scopes failed + why. Address each and resubmit.

Once **all four scopes** are approved, flip the app to Live mode (App Dashboard → App Mode toggle).
