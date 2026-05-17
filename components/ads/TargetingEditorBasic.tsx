// @deprecated: Phase 2 component. Use TargetingEditor (v2) for all Phase 4+ ad-set targeting.
'use client'
import type { AdTargeting } from '@/lib/ads/types'

interface Props {
  value: AdTargeting
  onChange: (next: AdTargeting) => void
}

const POPULAR_COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NZ', name: 'New Zealand' },
]

export function TargetingEditorBasic({ value, onChange }: Props) {
  const countries = value.geo.countries ?? []

  function toggleCountry(code: string) {
    const next = countries.includes(code)
      ? countries.filter((c) => c !== code)
      : [...countries, code]
    onChange({
      ...value,
      geo: { ...value.geo, countries: next },
    })
  }

  function setAge(field: 'ageMin' | 'ageMax', n: number) {
    onChange({
      ...value,
      demographics: { ...value.demographics, [field]: n },
    })
  }

  function toggleGender(g: 'male' | 'female') {
    const cur = value.demographics.genders ?? []
    const next = cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]
    onChange({
      ...value,
      demographics: { ...value.demographics, genders: next.length ? next : undefined },
    })
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium">Countries</legend>
        <p className="text-xs text-white/40 mt-0.5">Phase 2: countries only. Regions/cities land in Phase 4.</p>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {POPULAR_COUNTRIES.map((c) => (
            <label
              key={c.code}
              className="flex items-center gap-2 rounded border border-white/5 px-3 py-1.5 text-sm hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={countries.includes(c.code)}
                onChange={() => toggleCountry(c.code)}
                aria-label={c.name}
              />
              <span>{c.name}</span>
              <span className="ml-auto text-xs text-white/30">{c.code}</span>
            </label>
          ))}
        </div>
        {countries.length === 0 && (
          <div className="mt-2 text-xs text-red-300">Pick at least one country.</div>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="font-medium">Min age</span>
          <input
            type="number"
            min={13}
            max={65}
            className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
            value={value.demographics.ageMin}
            onChange={(e) => setAge('ageMin', Number(e.target.value))}
            aria-label="Minimum age"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Max age</span>
          <input
            type="number"
            min={13}
            max={65}
            className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
            value={value.demographics.ageMax}
            onChange={(e) => setAge('ageMax', Number(e.target.value))}
            aria-label="Maximum age"
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Gender</legend>
        <p className="text-xs text-white/40 mt-0.5">Leave both unchecked to target all genders.</p>
        <div className="mt-2 flex gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.demographics.genders?.includes('male') ?? false}
              onChange={() => toggleGender('male')}
            />
            Male
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.demographics.genders?.includes('female') ?? false}
              onChange={() => toggleGender('female')}
            />
            Female
          </label>
        </div>
      </fieldset>
    </div>
  )
}
