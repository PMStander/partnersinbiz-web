import { NextRequest } from 'next/server'
import { apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  // PDF rendering deferred to Phase E (requires @react-pdf/renderer install)
  return apiError('PDF rendering coming soon', 501)
}
