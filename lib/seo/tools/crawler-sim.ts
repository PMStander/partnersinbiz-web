import { fetchPage } from './page-fetch'

export interface CrawlerSimResult {
  url: string
  status: number
  bytes: number
  hasH1: boolean
  hasMainContent: boolean
  scriptHeavy: boolean
  bodyTextLength: number
  issues: string[]
}

export async function runCrawlerSim(url: string): Promise<CrawlerSimResult> {
  const page = await fetchPage(url, { userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })
  const html = page.html
  const bytes = html.length
  const hasH1 = /<h1[\s>]/i.test(html)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodyHtml = bodyMatch ? bodyMatch[1] : html
  // Strip script/style
  const stripped = bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  const text = stripped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const bodyTextLength = text.length
  const scriptCount = (html.match(/<script[\s>]/gi) ?? []).length
  const scriptHeavy = scriptCount > 10 || (bodyTextLength < 500 && scriptCount > 3)
  const hasMainContent = bodyTextLength > 200

  const issues: string[] = []
  if (!hasH1) issues.push('No <h1> found')
  if (!hasMainContent) issues.push('Body text under 200 chars — likely needs JS to render')
  if (scriptHeavy) issues.push(`Page is script-heavy (${scriptCount} <script> tags)`)
  if (page.status >= 400) issues.push(`Page returned status ${page.status}`)

  return { url, status: page.status, bytes, hasH1, hasMainContent, scriptHeavy, bodyTextLength, issues }
}
