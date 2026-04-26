// lib/reports/summary.ts
//
// AI-generated executive summary for a Report. Calls Anthropic directly via
// fetch (no SDK install). Keeps the prompt short and grounded — we hand the
// model the KPI numbers, not the full metrics fact table.

import type { ReportKpis, ReportPeriod } from './types'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

interface SummaryInput {
  brandName: string
  period: ReportPeriod
  previousPeriod: ReportPeriod
  kpis: ReportKpis
}

export interface SummaryOutput {
  exec_summary: string
  highlights: string[]
}

const SYSTEM = `You are an editorial copywriter for a South African web/AI agency called Partners in Biz, writing the monthly client report. Voice: direct, founder-led, dryly opinionated. British editorial register. Short sentences. No marketing speak. No emojis. No exclamation marks. Cite the underlying number when you make a claim. If the period had ZERO activity for a metric, say so plainly and move on. Do not invent numbers.`

function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}
function fmtPct(p: number | null): string {
  if (p === null) return 'n/a (no prior baseline)'
  const sign = p >= 0 ? '+' : ''
  return `${sign}${p.toFixed(1)}%`
}

function userPrompt(input: SummaryInput): string {
  const { kpis, period, previousPeriod, brandName } = input
  return `Write a monthly performance summary for ${brandName} covering ${period.start} to ${period.end} (timezone ${period.tz}). Compare against the prior period ${previousPeriod.start} to ${previousPeriod.end}.

KPIs (period totals — ZAR for money):
- Total revenue (all sources): ${fmtZar(kpis.total_revenue)} (${fmtPct(kpis.deltas.total_revenue)} vs prior)
- Subscription revenue: ${fmtZar(kpis.subscription_revenue)}
- IAP revenue: ${fmtZar(kpis.iap_revenue)} (${fmtPct(kpis.deltas.iap_revenue)})
- Ad revenue: ${fmtZar(kpis.ad_revenue)} (${fmtPct(kpis.deltas.ad_revenue)})
- Invoiced (paid): ${fmtZar(kpis.invoiced_revenue_paid)}
- Outstanding: ${fmtZar(kpis.outstanding)}
- MRR (end of period): ${fmtZar(kpis.mrr)} (${fmtPct(kpis.deltas.mrr)})
- ARR: ${fmtZar(kpis.arr)}
- Active subscriptions: ${kpis.active_subs.toLocaleString('en-ZA')} (${fmtPct(kpis.deltas.active_subs)})
- New subscriptions: ${kpis.new_subs.toLocaleString('en-ZA')}
- Trials started → converted: ${kpis.trials_started.toLocaleString('en-ZA')} → ${kpis.trials_converted.toLocaleString('en-ZA')}
- Churn: ${kpis.churn.toLocaleString('en-ZA')}
- Sessions: ${kpis.sessions.toLocaleString('en-ZA')} (${fmtPct(kpis.deltas.sessions)})
- Pageviews: ${kpis.pageviews.toLocaleString('en-ZA')}
- Users: ${kpis.users.toLocaleString('en-ZA')}
- Conversions: ${kpis.conversions.toLocaleString('en-ZA')}
- Installs: ${kpis.installs.toLocaleString('en-ZA')} (${fmtPct(kpis.deltas.installs)})
- Uninstalls: ${kpis.uninstalls.toLocaleString('en-ZA')}
- Impressions: ${kpis.impressions.toLocaleString('en-ZA')}
- Clicks: ${kpis.clicks.toLocaleString('en-ZA')}
- Ad spend: ${fmtZar(kpis.ad_spend)}
- ROAS (end of period): ${kpis.roas ?? 'n/a'}

Return JSON with two keys, no other prose, no markdown fences:
{
  "exec_summary": "<3 paragraphs, separated by \\\\n\\\\n. Total ~180-260 words.>",
  "highlights": ["<bullet 1>", "<bullet 2>", "<bullet 3>", "<bullet 4>", "<bullet 5>"]
}

Each highlight is a short sentence (≤14 words). No emojis. Numbers in highlights must be cited from the KPI table.`
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>
}

function parseModelJson(raw: string): SummaryOutput {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const json = fenced ? fenced[1] : raw
  const start = json.indexOf('{')
  const end = json.lastIndexOf('}')
  const slice = start >= 0 && end > start ? json.slice(start, end + 1) : json
  const parsed = JSON.parse(slice) as Partial<SummaryOutput>
  const exec = typeof parsed.exec_summary === 'string' ? parsed.exec_summary.trim() : ''
  const highlights = Array.isArray(parsed.highlights)
    ? parsed.highlights.map((h) => String(h).trim()).filter(Boolean).slice(0, 5)
    : []
  if (!exec || highlights.length === 0) {
    throw new Error('model returned malformed summary')
  }
  return { exec_summary: exec, highlights }
}

/**
 * Generate exec summary + highlights via Claude. Returns a friendly
 * placeholder string if no API key is configured — never throws on auth
 * issues so a report can always be rendered.
 */
export async function generateSummary(input: SummaryInput): Promise<SummaryOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      exec_summary: `${input.brandName} — period ${input.period.start} to ${input.period.end}.\n\nAI summary unavailable: ANTHROPIC_API_KEY not configured. The numbers below tell the story; come back here once the key is set for a written narrative.\n\nUntil then: review the KPI deltas section to see what moved.`,
      highlights: [
        `Period ${input.period.start} to ${input.period.end}`,
        `Total revenue ${fmtZar(input.kpis.total_revenue)}`,
        `MRR ${fmtZar(input.kpis.mrr)} (${fmtPct(input.kpis.deltas.mrr)})`,
        `${input.kpis.installs.toLocaleString('en-ZA')} installs`,
        `${input.kpis.sessions.toLocaleString('en-ZA')} sessions`,
      ],
    }
  }

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt(input) }],
      }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`anthropic ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = (await res.json()) as AnthropicResponse
    const text = (data.content ?? []).find((b) => b.type === 'text')?.text ?? ''
    return parseModelJson(text)
  } catch (err) {
    console.error('[reports/summary] AI summary failed:', err)
    return {
      exec_summary: `${input.brandName} — period ${input.period.start} to ${input.period.end}.\n\nThe AI executive summary failed to generate this run (${err instanceof Error ? err.message : 'unknown'}). The KPI table below is authoritative. Try regenerating from the admin UI.`,
      highlights: [
        `Total revenue ${fmtZar(input.kpis.total_revenue)} (${fmtPct(input.kpis.deltas.total_revenue)})`,
        `MRR ${fmtZar(input.kpis.mrr)}`,
        `${input.kpis.active_subs.toLocaleString('en-ZA')} active subscriptions`,
        `${input.kpis.installs.toLocaleString('en-ZA')} installs`,
        `${input.kpis.sessions.toLocaleString('en-ZA')} sessions`,
      ],
    }
  }
}
