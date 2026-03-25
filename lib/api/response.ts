import { NextResponse } from 'next/server'
import type { ApiMeta, ApiResponse } from './types'

export function apiSuccess<T>(
  data: T,
  status = 200,
  meta?: ApiMeta,
): NextResponse<ApiResponse<T>> {
  const body: ApiResponse<T> = { success: true, data }
  if (meta) body.meta = meta
  return NextResponse.json(body, { status })
}

export function apiError(
  error: string,
  status = 400,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error }, { status })
}
