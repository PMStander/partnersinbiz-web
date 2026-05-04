export * from './client'
export * from './pull'

export function getBingApiKey(): string {
  const k = process.env.BING_WMT_API_KEY
  if (!k) throw new Error('BING_WMT_API_KEY not set')
  return k
}
