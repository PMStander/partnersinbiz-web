import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { requireHermesProfileAccess, callHermesStream } from '@/lib/hermes/server'
import { apiError } from '@/lib/api/response'

type RouteContext = { params: Promise<{ orgId: string; runId: string }> }

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (_req: NextRequest, user, ctx) => {
  const { orgId, runId } = await (ctx as RouteContext).params

  const access = await requireHermesProfileAccess(user, orgId, 'runs')
  if (access instanceof Response) return access
  const { link } = access

  try {
    const hermesRes = await callHermesStream(link, `/v1/runs/${encodeURIComponent(runId)}/events`)
    const reader = hermesRes.body!.getReader()

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }
          controller.enqueue(value)
        } catch (err) {
          controller.error(err)
        }
      },
      cancel() {
        reader.cancel()
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Stream failed', 502)
  }
})
