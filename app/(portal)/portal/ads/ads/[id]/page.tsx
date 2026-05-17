// app/(portal)/portal/ads/ads/[id]/page.tsx
//
// Client-facing ad detail with inline-comments thread (Sub-2b A).
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getAd } from '@/lib/ads/ads/store'
import { CommentThread } from './CommentThread'

export const dynamic = 'force-dynamic'

async function currentClient(): Promise<{ uid: string; orgId: string } | null> {
  const cookieStore = await cookies()
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const session = cookieStore.get(cookieName)?.value
  if (!session) return null
  try {
    const decoded = await adminAuth.verifySessionCookie(session, true)
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
    const orgId = userDoc.data()?.activeOrgId ?? userDoc.data()?.orgId
    if (!orgId) return null
    return { uid: decoded.uid, orgId }
  } catch {
    return null
  }
}

function inferImageUrl(ad: Awaited<ReturnType<typeof getAd>>): string | null {
  if (!ad) return null
  if (ad.inlineImageUrl) return ad.inlineImageUrl
  const meta = (ad.providerData?.meta ?? {}) as Record<string, unknown>
  for (const key of ['imageUrl', 'image_url', 'preview_url', 'previewUrl']) {
    const v = meta[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

export default async function PortalAdDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await currentClient()
  if (!user) redirect('/login')

  const ad = await getAd(id)
  if (!ad || ad.orgId !== user.orgId) notFound()

  const imageUrl = inferImageUrl(ad)
  const isVideo = ad.format === 'SINGLE_VIDEO'

  return (
    <article className="space-y-6">
      <header>
        <Link
          href={`/portal/ads/campaigns/${ad.campaignId}`}
          className="text-xs text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)]"
        >
          ← Campaign
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--color-pib-text)]">
          {ad.name}
        </h1>
        <div className="mt-1 text-sm text-[var(--color-pib-text-muted)]">
          {ad.format.toLowerCase()} · {ad.status.toLowerCase()}
        </div>
      </header>

      <section>
        <h2 className="eyebrow !text-[10px] mb-2">Preview</h2>
        <div className="rounded border border-[var(--color-pib-line)] bg-[var(--color-pib-surface)] p-4">
          {isVideo ? (
            <div className="flex h-48 items-center justify-center text-sm text-[var(--color-pib-text-muted)]">
              Video preview
            </div>
          ) : imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={ad.name}
              className="max-h-96 w-auto rounded"
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-[var(--color-pib-text-muted)]">
              No creative preview available
            </div>
          )}
        </div>

        {ad.copy?.headline && (
          <div className="mt-3 space-y-1 text-sm">
            <div className="font-medium text-[var(--color-pib-text)]">
              {ad.copy.headline}
            </div>
            {ad.copy.primaryText && (
              <p className="text-[var(--color-pib-text-muted)]">
                {ad.copy.primaryText}
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="eyebrow !text-[10px] mb-2">Comments</h2>
        <CommentThread
          adId={id}
          currentUserUid={user.uid}
          isAdmin={false}
        />
      </section>
    </article>
  )
}
