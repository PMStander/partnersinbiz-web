import { fetchPage } from './page-fetch'

const REQUIRED_PROPS: Record<string, string[]> = {
  SoftwareApplication: ['name', 'applicationCategory'],
  FAQPage: ['mainEntity'],
  Article: ['headline', 'author', 'datePublished'],
  Product: ['name'],
  BreadcrumbList: ['itemListElement'],
  Organization: ['name'],
  WebSite: ['name', 'url'],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SchemaValidation {
  url: string
  blocks: { raw: string; parsed: any; type: string; missing: string[]; valid: boolean }[]
  issues: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runSchemaValidate(url: string): Promise<SchemaValidation> {
  const page = await fetchPage(url)
  const matches = [...page.html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const blocks: SchemaValidation['blocks'] = []
  const issues: string[] = []
  for (const m of matches) {
    const raw = m[1].trim()
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      blocks.push({ raw, parsed: null, type: 'invalid', missing: [], valid: false })
      issues.push('Invalid JSON in schema block')
      continue
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(parsed) ? parsed : [parsed]
    for (const item of items) {
      const type = item['@type'] ?? 'Unknown'
      const required = REQUIRED_PROPS[type] ?? []
      const missing = required.filter((p) => !(p in item))
      const valid = missing.length === 0
      blocks.push({ raw, parsed: item, type, missing, valid })
      if (!valid) issues.push(`${type} missing: ${missing.join(', ')}`)
    }
  }
  if (blocks.length === 0) issues.push('No JSON-LD found')
  return { url, blocks, issues }
}
