'use client'
import { useState } from 'react'
import type { AdBidStrategy } from '@/lib/ads/types'

export interface BudgetValue {
  shape: 'daily' | 'lifetime'
  amount: number  // cents
  cboEnabled?: boolean  // campaign-level only
  bidStrategy?: AdBidStrategy
  startTimeISO?: string
  endTimeISO?: string
}

interface Props {
  level: 'campaign' | 'adset'
  currency?: string  // ISO 4217 (e.g. 'USD'); display only
  value: BudgetValue
  onChange: (next: BudgetValue) => void
}

const BID_STRATEGIES: { value: AdBidStrategy; label: string }[] = [
  { value: 'LOWEST_COST', label: 'Lowest cost' },
  { value: 'COST_CAP', label: 'Cost cap' },
  { value: 'BID_CAP', label: 'Bid cap' },
  { value: 'TARGET_COST', label: 'Target cost' },
  { value: 'ROAS_GOAL', label: 'ROAS goal' },
]

export function BudgetEditor({ level, currency = 'USD', value, onChange }: Props) {
  const [displayAmount, setDisplayAmount] = useState(String(value.amount / 100))

  function emit(patch: Partial<BudgetValue>) {
    onChange({ ...value, ...patch })
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const s = e.target.value
    setDisplayAmount(s)
    const dollars = parseFloat(s)
    if (!Number.isNaN(dollars)) emit({ amount: Math.round(dollars * 100) })
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-sm font-medium">Budget shape</legend>
        <div className="mt-2 flex gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="budget-shape"
              checked={value.shape === 'daily'}
              onChange={() => emit({ shape: 'daily' })}
            />
            Daily
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="budget-shape"
              checked={value.shape === 'lifetime'}
              onChange={() => emit({ shape: 'lifetime' })}
            />
            Lifetime
          </label>
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="font-medium">
          {value.shape === 'daily' ? 'Daily' : 'Lifetime'} amount ({currency})
        </span>
        <input
          type="number"
          min="0"
          step="0.01"
          className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={displayAmount}
          onChange={handleAmountChange}
          aria-label="Budget amount"
        />
      </label>

      {value.shape === 'lifetime' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium">Start</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
              value={value.startTimeISO ?? ''}
              onChange={(e) => emit({ startTimeISO: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">End</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
              value={value.endTimeISO ?? ''}
              onChange={(e) => emit({ endTimeISO: e.target.value })}
            />
          </label>
        </div>
      )}

      {level === 'campaign' && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!value.cboEnabled}
              onChange={(e) => emit({ cboEnabled: e.target.checked })}
            />
            <span className="font-medium">Use Campaign Budget Optimization (CBO)</span>
          </label>

          <label className="block text-sm">
            <span className="font-medium">Bid strategy</span>
            <select
              className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
              value={value.bidStrategy ?? 'LOWEST_COST'}
              onChange={(e) => emit({ bidStrategy: e.target.value as AdBidStrategy })}
            >
              {BID_STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  )
}
