import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { calculateSeoRoi } from '@/lib/seo/tools/seo-roi'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body?.keywords) return apiError('keywords is required', 400)
  // Accept either array or comma string
  let keywords: { keyword: string; volume: number; estimatedPosition?: number }[]
  if (Array.isArray(body.keywords)) {
    keywords = body.keywords
  } else {
    keywords = String(body.keywords)
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .map((k) => ({ keyword: k, volume: Number(body.defaultVolume ?? 100) }))
  }
  const conversionRate = parseFloat(body.conversionRate ?? '0.02')
  const avgValue = parseFloat(body.avgValue ?? '1000')
  const result = calculateSeoRoi({ keywords, conversionRate, avgValue })
  return apiSuccess(result)
})
