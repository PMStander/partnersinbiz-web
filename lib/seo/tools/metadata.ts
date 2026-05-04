import { fetchPage } from './page-fetch'

export interface MetadataAudit {
  url: string
  status: number
  title: string | null
  titleLength: number
  description: string | null
  descriptionLength: number
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  twitterCard: string | null
  twitterTitle: string | null
  twitterDescription: string | null
  canonical: string | null
  robots: string | null
  issues: string[]
}

function tag(html: string, regex: RegExp): string | null {
  const m = html.match(regex)
  return m ? m[1].trim() : null
}

export async function runMetadataCheck(url: string): Promise<MetadataAudit> {
  const page = await fetchPage(url)
  const html = page.html

  const title = tag(html, /<title[^>]*>([^<]*)<\/title>/i)
  const description = tag(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
  const ogTitle = tag(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i)
  const ogDescription = tag(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i)
  const ogImage = tag(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i)
  const twitterCard = tag(html, /<meta\s+name=["']twitter:card["']\s+content=["']([^"']*)["']/i)
  const twitterTitle = tag(html, /<meta\s+name=["']twitter:title["']\s+content=["']([^"']*)["']/i)
  const twitterDescription = tag(html, /<meta\s+name=["']twitter:description["']\s+content=["']([^"']*)["']/i)
  const canonical = tag(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i)
  const robots = tag(html, /<meta\s+name=["']robots["']\s+content=["']([^"']*)["']/i)

  const issues: string[] = []
  if (!title) issues.push('Missing <title>')
  else if (title.length < 30) issues.push(`Title is short (${title.length} chars; aim for 50-60)`)
  else if (title.length > 65) issues.push(`Title is long (${title.length} chars; max 60)`)
  if (!description) issues.push('Missing meta description')
  else if (description.length < 70) issues.push(`Description is short (${description.length} chars)`)
  else if (description.length > 165) issues.push(`Description is long (${description.length} chars; max 160)`)
  if (!ogTitle) issues.push('Missing og:title')
  if (!ogImage) issues.push('Missing og:image')
  if (!canonical) issues.push('Missing canonical')
  if (robots && robots.toLowerCase().includes('noindex')) issues.push('robots is set to noindex')

  return {
    url,
    status: page.status,
    title,
    titleLength: title?.length ?? 0,
    description,
    descriptionLength: description?.length ?? 0,
    ogTitle,
    ogDescription,
    ogImage,
    twitterCard,
    twitterTitle,
    twitterDescription,
    canonical,
    robots,
    issues,
  }
}
