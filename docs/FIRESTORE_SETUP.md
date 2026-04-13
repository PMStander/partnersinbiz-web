# Firestore Setup for Link Shortening

## Indexes

Create the following composite index in Firestore for optimal link listing performance:

### Index 1: Links by Org and Date

**Collection**: `shortened_links`

**Fields**:
- `orgId` (Ascending)
- `createdAt` (Descending)

**Query Pattern**: `WHERE orgId == ? ORDER BY createdAt DESC`

This index is used by:
- `GET /api/v1/links` — list links with pagination
- `lib/links/shorten.ts` — ensure unique code lookup (WHERE orgId, WHERE shortCode)

### Creating the Index

#### Option 1: Via Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → Firestore Database
3. Click "Indexes" tab
4. Click "Create Index"
5. Collection: `shortened_links`
6. Fields:
   - `orgId` (Ascending)
   - `createdAt` (Descending)
7. Click "Create"

#### Option 2: Via Firebase CLI

```bash
firebase firestore:indexes --project=your-project-id
# Or deploy via firebase.json
```

In `firebase.json`:

```json
{
  "firestore": {
    "indexes": [
      {
        "collectionId": "shortened_links",
        "queryScope": "COLLECTION",
        "fields": [
          {
            "fieldPath": "orgId",
            "order": "ASCENDING"
          },
          {
            "fieldPath": "createdAt",
            "order": "DESCENDING"
          }
        ]
      }
    ]
  }
}
```

Deploy:

```bash
firebase deploy --only firestore:indexes --project=your-project-id
```

## Security Rules

Add the following rules to your Firestore security rules to enforce multi-tenant isolation:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ... existing rules ...

    // Shortened links — authenticated users only, org-scoped
    match /shortened_links/{linkId} {
      // List and create
      match /{document=**} {
        allow read, write: if request.auth != null && 
          (request.auth.uid in request.auth.token.orgs || 
           get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
      }

      // Click subcollection — read-only (writes via Cloud Function or server API)
      match /clicks/{clickId} {
        allow read: if request.auth != null
        allow write: if false // Writes only via trusted backend
      }
    }

    // Public short link redirect — NO AUTH REQUIRED
    match /l/{code} {
      allow read: if true
    }
  }
}
```

**Note**: The actual implementation uses server-side API routes with `adminDb`, which bypasses Firestore security rules. These rules provide a secondary layer of protection for direct client SDK access (if implemented later).

## Collection Structure

```
shortened_links
├── {linkId: string}
│   ├── id: string
│   ├── orgId: string
│   ├── originalUrl: string
│   ├── shortCode: string (indexed)
│   ├── shortUrl: string
│   ├── utmSource: string (optional)
│   ├── utmMedium: string (optional)
│   ├── utmCampaign: string (optional)
│   ├── utmTerm: string (optional)
│   ├── utmContent: string (optional)
│   ├── clickCount: number
│   ├── createdBy: string
│   ├── createdAt: Timestamp
│   ├── updatedAt: Timestamp
│   │
│   └── clicks (subcollection)
│       └── {clickId: string}
│           ├── linkId: string
│           ├── orgId: string
│           ├── timestamp: Timestamp
│           ├── referrer: string | null
│           ├── userAgent: string | null
│           ├── ip: string | null
│           └── country: string | null
```

## Data Types

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `id` | String | `abc123def456` | Firestore doc ID |
| `orgId` | String | `default` | Multi-tenant scoping |
| `originalUrl` | String | `https://example.com/page` | Full destination |
| `shortCode` | String | `xYz9AbC` | 7 chars: A-Z a-z 0-9 |
| `shortUrl` | String | `https://app.com/l/xYz9AbC` | Generated from code |
| `utmSource` | String | `twitter`, `facebook`, etc. | Optional, free-form |
| `utmMedium` | String | `social`, `email`, etc. | Optional, free-form |
| `utmCampaign` | String | `launch`, `q2_promotion`, etc. | Optional, free-form |
| `utmTerm` | String | `keyword1`, `interest_group_3` | Optional, free-form |
| `utmContent` | String | `banner_v2`, `post_123` | Optional, free-form |
| `clickCount` | Number | `42` | Updated on each click |
| `createdBy` | String | `user_id` | Who created the link |
| `createdAt` | Timestamp | `2026-04-13T14:30:00Z` | Server timestamp |
| `updatedAt` | Timestamp | `2026-04-13T14:30:00Z` | Updated on clicks |
| `referrer` | String | `https://twitter.com/...` | From click event |
| `userAgent` | String | `Mozilla/5.0 ...` | From click event |
| `ip` | String | `203.0.113.42` | From request header |
| `country` | String | `US`, `GB`, etc. | Inferred from IP (TODO) |

## Quota and Limits

### Document Size

- Main link document: ~500 bytes
- Click document: ~300 bytes
- Typical link: ~500-600 bytes (with UTM params)

### Operational Limits

| Operation | Limit | Notes |
|-----------|-------|-------|
| Write QPS | 20,000 per second per collection | Click tracking won't hit this |
| Read QPS | 50,000 per second per collection | Analytics queries are moderate |
| Document size | 1 MB | Links well under this |
| Subcollection depth | No limit | Only 1 level deep (clicks) |
| Fields per document | No limit | ~15 fields per link |

### Example Load Calculation

For 1 million links with average 10 clicks each:
- Documents: 1M (links) + 10M (clicks) = 11M documents
- Storage: ~6.5 GB
- Monthly writes: 10M clicks + 1M creates = 11M writes
- Monthly reads: Analytics queries + list ops ~5M reads

This is well within Firestore's free tier and typical production quotas.

## Backups

Firestore has native backup support. Set up automated backups:

```bash
# Manual backup
gcloud firestore databases backup create \
  --database='(default)' \
  --location='us-central1'
```

Or enable scheduled backups in Firebase Console:
1. Firestore Database → Backups
2. Create Backup Schedule
3. Frequency: Daily or Weekly
4. Retention: 30 days recommended

## Data Retention

Links are retained indefinitely (soft-delete only).

Click data accumulates indefinitely. For high-volume links (>10k clicks/month), consider:

1. **Archival**: Copy old clicks to a separate "archived_clicks" collection
2. **Aggregation**: Materialize daily summaries, delete raw clicks after 90 days
3. **TTL**: Use Cloud Functions to auto-delete clicks older than N days

Example Cloud Function for auto-archiving:

```typescript
import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

export const archiveOldClicks = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM
  .onRun(async () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const snapshot = await db
      .collectionGroup('clicks')
      .where('timestamp', '<', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .get()

    const batch = db.batch()
    let count = 0

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref)
      count++
      
      // Firestore batch limit
      if (count >= 500) {
        batch.commit()
        batch.reset()
        count = 0
      }
    })

    if (count > 0) await batch.commit()
    console.log(`Archived ${snapshot.size} old clicks`)
  })
```

## Monitoring

### Recommended Metrics

Monitor in Firebase Console:

1. **Document writes**: Should correlate with link creation rate
2. **Collection size**: Track growth of `shortened_links` and `clicks`
3. **Read latency**: P50/P95/P99 for list and stats operations
4. **Billing**: Watch for unexpected quota usage

### Cloud Monitoring Queries

```javascript
// Links created per day
SELECT VALUE COUNT(DISTINCT resource.labels.document_id)
FROM RESOURCE.type = "firestore_document"
WHERE resource.labels.database_name = "(default)"
  AND resource.labels.collection_id = "shortened_links"
  AND timestamp >= TIMESTAMP.sub(now(), interval 1 day)

// Clicks per day
SELECT VALUE COUNT(DISTINCT resource.labels.document_id)
FROM RESOURCE.type = "firestore_document"
WHERE resource.labels.database_name = "(default)"
  AND resource.labels.collection_id = "clicks"
  AND timestamp >= TIMESTAMP.sub(now(), interval 1 day)
```

## Migration from Other Systems

If migrating from an existing link shortener:

1. **Export data** from old system
2. **Transform** to match `ShortenedLink` schema
3. **Bulk import** via Cloud Firestore import
4. **Test redirects** before cutover
5. **Update** `NEXT_PUBLIC_APP_URL` in environment
6. **Monitor** for any broken links during transition

Example import script:

```typescript
import { adminDb } from '@/lib/firebase/admin'

async function importLegacyLinks(csvPath: string) {
  const fs = require('fs')
  const csv = require('csv-parse')

  const links: any[] = []
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (row) => {
      links.push({
        orgId: row.org_id,
        shortCode: row.short_code,
        originalUrl: row.original_url,
        clickCount: parseInt(row.click_count || '0'),
        createdAt: new Date(row.created_at),
        createdBy: row.created_by
      })
    })
    .on('end', async () => {
      // Batch write
      const batch = adminDb.batch()
      let count = 0

      for (const link of links) {
        const ref = adminDb.collection('shortened_links').doc()
        batch.set(ref, link)
        count++

        if (count >= 500) {
          await batch.commit()
          batch.reset()
          count = 0
        }
      }

      if (count > 0) await batch.commit()
      console.log(`Imported ${links.length} links`)
    })
}
```

## Troubleshooting

### "Document already exists" on create

Short code collision (rare). Retry — system auto-regenerates up to 10 times.

### Clicks not tracked

Check server logs for "Failed to track click" errors. Click tracking is fire-and-forget, so redirect still succeeds.

### Links not showing in list

Verify `orgId` matches the current user's organization. Check Firestore rules.

### High latency on analytics

Limit to recent 1000 clicks. For links with millions of clicks, implement materialized views or external analytics service.
