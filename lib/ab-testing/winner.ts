// lib/ab-testing/winner.ts
//
// Winner selection.
//
// Picks the highest-performing variant by the chosen metric.
//   - opens:               raw open count
//   - clicks:              raw click count
//   - open-rate:           opened / max(sent, 1)
//   - click-through-rate:  clicked / max(opened, 1)   (a.k.a. CTR among opens)
//
// Ties are broken by `sent` (most data wins). If still tied, the variant that
// appears earliest in the array wins (stable). Returns null if no variant has
// any sends — we never crown a winner with zero data.
import type { AbWinnerMetric, Variant } from './types'

function score(v: Variant, metric: AbWinnerMetric): number {
  switch (metric) {
    case 'opens':
      return v.opened
    case 'clicks':
      return v.clicked
    case 'open-rate':
      return v.sent > 0 ? v.opened / v.sent : 0
    case 'click-through-rate':
      return v.opened > 0 ? v.clicked / v.opened : 0
  }
}

export function selectWinner(variants: Variant[], metric: AbWinnerMetric): Variant | null {
  if (!variants || variants.length === 0) return null
  const withData = variants.filter((v) => v.sent > 0)
  if (withData.length === 0) return null

  let best: Variant = withData[0]
  let bestScore = score(best, metric)
  for (let i = 1; i < withData.length; i++) {
    const v = withData[i]
    const s = score(v, metric)
    if (s > bestScore) {
      best = v
      bestScore = s
    } else if (s === bestScore) {
      // Tie-break: more sends wins (more confident).
      if (v.sent > best.sent) {
        best = v
        bestScore = s
      }
    }
  }
  return best
}
