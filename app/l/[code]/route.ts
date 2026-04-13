import { resolveShortCode, trackClick } from '@/lib/links/shorten'

export const dynamic = 'force-dynamic'

/**
 * GET /l/[code]
 * Public redirect endpoint — no authentication required
 * Looks up the short code, tracks the click, and redirects
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params

  // Validate short code format (alphanumeric only)
  if (!/^[a-zA-Z0-9]{6,8}$/.test(code)) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/' },
    })
  }

  const resolved = await resolveShortCode(code)
  if (!resolved) {
    // Link not found — redirect to homepage
    return new Response(null, {
      status: 302,
      headers: { Location: '/' },
    })
  }

  // Track the click (fire-and-forget, don't await)
  trackClick(resolved.linkId, '', req).catch(() => {})

  // Redirect to the original URL with UTM params
  return new Response(null, {
    status: 302,
    headers: { Location: resolved.url },
  })
}
