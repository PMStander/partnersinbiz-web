'use client'

import { useState } from 'react'

const TOOLS = [
  { key: 'metadata-check', label: 'Metadata Check', input: 'url', desc: 'Audit page title, description, OG, Twitter cards' },
  { key: 'robots-check', label: 'Robots.txt Check', input: 'domain', desc: 'Validate robots.txt, flag accidental blocks' },
  { key: 'sitemap-check', label: 'Sitemap Check', input: 'sitemapUrl', desc: 'Count URLs, spot-check for 404s' },
  { key: 'canonical-check', label: 'Canonical Check', input: 'url', desc: 'Audit canonical tags' },
  { key: 'crawler-sim', label: 'Crawler Simulator', input: 'url', desc: 'See what Googlebot can render' },
  { key: 'schema-validate', label: 'Schema Validator', input: 'url', desc: 'Validate JSON-LD against schema.org' },
  { key: 'keyword-density', label: 'Keyword Density', input: 'urlKeyword', desc: 'Term frequency on a page' },
  { key: 'internal-link-audit', label: 'Internal Link Audit', input: 'sitemapUrl', desc: 'Find orphan pages, score link equity' },
  { key: 'seo-roi', label: 'SEO ROI Calculator', input: 'roi', desc: 'Project organic value' },
  { key: 'title-generate', label: 'AI Title Generator', input: 'topicKeyword', desc: '5 SEO title options' },
  { key: 'meta-generate', label: 'AI Meta Description', input: 'topicKeyword', desc: '3 meta description options' },
  { key: 'slug-generate', label: 'Slug Generator', input: 'title', desc: 'URL-safe slug from title' },
  { key: 'keyword-discover', label: 'Keyword Discovery', input: 'seedKeyword', desc: 'GSC + Autocomplete + Wikipedia' },
]

export default function ToolsPage() {
  const [openKey, setOpenKey] = useState<string | null>(null)
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">SEO Tools</h1>
        <p className="text-sm text-[var(--color-pib-text-muted)]">
          In-house SEO toolkit. Pip uses these via the skill, but you can run them ad-hoc here too.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((t) => (
          <ToolCard key={t.key} tool={t} expanded={openKey === t.key} onToggle={() => setOpenKey(openKey === t.key ? null : t.key)} />
        ))}
      </div>
    </div>
  )
}

interface ToolDef {
  key: string
  label: string
  input: string
  desc: string
}

function ToolCard({ tool, expanded, onToggle }: { tool: ToolDef; expanded: boolean; onToggle: () => void }) {
  const [busy, setBusy] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  async function run() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`/api/v1/seo/tools/${tool.key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      setResult(json)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-sm">{tool.label}</h3>
          <p className="text-xs text-[var(--color-pib-text-muted)]">{tool.desc}</p>
        </div>
        <button onClick={onToggle} className="text-xs underline">
          {expanded ? 'Close' : 'Open'}
        </button>
      </div>
      {expanded && (
        <div className="space-y-2 pt-2 border-t">
          {fieldsFor(tool.input).map((f) => (
            <label key={f.name} className="block text-xs">
              {f.label}
              <input
                type={f.type ?? 'text'}
                value={fields[f.name] ?? ''}
                onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })}
                className="mt-1 w-full border rounded px-2 py-1 text-xs"
              />
            </label>
          ))}
          <button
            onClick={run}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? 'Running…' : 'Run'}
          </button>
          {result && (
            <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto max-h-60">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function fieldsFor(kind: string): { name: string; label: string; type?: string }[] {
  switch (kind) {
    case 'url':
      return [{ name: 'url', label: 'Page URL' }]
    case 'domain':
      return [{ name: 'domain', label: 'Domain (no protocol)' }]
    case 'sitemapUrl':
      return [{ name: 'sitemapUrl', label: 'Sitemap URL' }]
    case 'urlKeyword':
      return [
        { name: 'url', label: 'Page URL' },
        { name: 'keyword', label: 'Keyword' },
      ]
    case 'topicKeyword':
      return [
        { name: 'topic', label: 'Topic' },
        { name: 'keyword', label: 'Keyword' },
      ]
    case 'title':
      return [{ name: 'title', label: 'Title' }]
    case 'seedKeyword':
      return [
        { name: 'seedKeywords', label: 'Seed keywords (comma-sep)' },
        { name: 'siteUrl', label: 'Your site URL' },
      ]
    case 'roi':
      return [
        { name: 'keywords', label: 'Keywords (comma)' },
        { name: 'conversionRate', label: 'Conversion rate (0.05 for 5%)' },
        { name: 'avgValue', label: 'Avg conversion value (ZAR)' },
      ]
    default:
      return [{ name: 'input', label: 'Input' }]
  }
}
