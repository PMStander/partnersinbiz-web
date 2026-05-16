/**
 * Phase 1 acceptance smoke test.
 *
 * Prerequisites:
 *   - You ran the OAuth flow once manually via the /admin/org/<slug>/ads/connections page,
 *     connecting a Meta sandbox test user added under partnersinbiz' Meta app.
 *   - .env.local has FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET,
 *     SOCIAL_TOKEN_MASTER_KEY set.
 *   - You set SMOKE_ORG_ID to the test PiB org's ID.
 *
 * Run with:  npx tsx scripts/smoke-ads-meta-phase1.ts
 */
import { listConnections, decryptAccessToken } from '@/lib/ads/connections/store'
import { getProvider } from '@/lib/ads/registry'

async function main() {
  const orgId = process.env.SMOKE_ORG_ID
  if (!orgId) throw new Error('Set SMOKE_ORG_ID=<org_id> first')

  const conns = await listConnections({ orgId })
  const meta = conns.find((c) => c.platform === 'meta')
  if (!meta) {
    throw new Error(
      `No Meta connection on org ${orgId}. Run OAuth from /admin/org/<slug>/ads/connections first.`,
    )
  }

  console.log('✓ Connection found:', meta.id, 'with', meta.adAccounts.length, 'ad accounts')

  const provider = getProvider('meta')
  const fresh = await provider.listAdAccounts({ accessToken: decryptAccessToken(meta) })
  console.log('✓ Live re-fetch returned', fresh.length, 'ad accounts')

  if (fresh.length === 0) {
    console.warn('⚠ Zero ad accounts — make sure the test user has at least one in Meta Business Manager.')
  }

  console.log('\nPhase 1 acceptance: PASSED')
}

main().catch((err) => {
  console.error('Phase 1 acceptance: FAILED\n', err)
  process.exit(1)
})
