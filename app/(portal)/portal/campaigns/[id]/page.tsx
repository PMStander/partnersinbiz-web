import type { CSSProperties } from 'react'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { loadCampaignWithAssets } from '@/lib/campaigns/load'
import { getBrandKitForOrg } from '@/lib/brand-kit/store'
import type { PreviewBrand } from '@/components/campaign-preview'
import { CockpitClient } from './cockpit-client'

export const dynamic = 'force-dynamic'

async function currentUser(): Promise<{ uid: string; orgId?: string } | null> {
  const cookieStore = await cookies()
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const session = cookieStore.get(cookieName)?.value
  if (!session) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
    return { uid: decoded.uid, orgId: userDoc.data()?.orgId }
  } catch {
    return null
  }
}

function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `#${m[1]}${a}`
}

export default async function PortalCampaignCockpitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const { id } = await params
  const loaded = await loadCampaignWithAssets(id)
  if (!loaded) notFound()

  const { campaign, assets } = loaded
  if (campaign.orgId !== user.orgId) notFound()

  const isEmailCampaign =
    Boolean(campaign.sequenceId) ||
    (!campaign.clientType && !campaign.research && !campaign.brandIdentity)
  if (isEmailCampaign) {
    redirect(`/portal/campaigns/email/${id}`)
  }

  const brandKit = await getBrandKitForOrg(user.orgId!)
  const accent = brandKit.accentColor || brandKit.primaryColor

  const previewBrand: PreviewBrand = {
    palette: {
      bg: brandKit.backgroundColor,
      accent,
      alert: '#FCA5A5',
      text: brandKit.textColor,
      muted: brandKit.mutedTextColor,
    },
    typography: {
      heading: brandKit.fontFamilyHeadings,
      body: brandKit.fontFamilyPrimary,
    },
    logoUrl: brandKit.logoUrl || undefined,
  }

  const styleVars = {
    '--org-bg': brandKit.backgroundColor,
    '--org-accent': accent,
    '--org-text': brandKit.textColor,
    '--org-text-muted': brandKit.mutedTextColor,
    backgroundImage: `radial-gradient(1100px 480px at 0% -10%, ${withAlpha(accent, 0.08)} 0%, transparent 60%)`,
  } as CSSProperties

  return (
    <div className="-m-6 p-6 min-h-screen" style={styleVars}>
      <CockpitClient
        campaignId={id}
        campaign={campaign}
        assets={assets}
        brand={previewBrand}
        shareToken={campaign.shareToken}
        shareEnabled={campaign.shareEnabled !== false}
      />
    </div>
  )
}
