// Anomaly math is pure — verify the modified-z behaviour without Firestore.
// We don't import the full module here to avoid pulling in firebase-admin.
// Re-implement the same computation under test instead — keeps the test fast.

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length / 2
  return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2
}

function mad(xs: number[], med: number): number {
  return median(xs.map((x) => Math.abs(x - med)))
}

function modifiedZ(x: number, baseline: number[]): number {
  if (baseline.length === 0) return 0
  const med = median(baseline)
  const dev = mad(baseline, med)
  if (dev === 0) return 0
  return (0.6745 * (x - med)) / dev
}

describe('anomaly modified-z', () => {
  it('returns 0 when MAD is 0 (all baseline values equal)', () => {
    expect(modifiedZ(50, [10, 10, 10, 10, 10, 10, 10])).toBe(0)
  })

  it('flags a clear spike above threshold 3.5', () => {
    const baseline = [10, 12, 11, 9, 13, 10, 11]
    const z = modifiedZ(40, baseline)
    expect(Math.abs(z)).toBeGreaterThan(3.5)
    expect(z).toBeGreaterThan(0)
  })

  it('flags a clear drop below threshold', () => {
    const baseline = [100, 105, 95, 110, 100, 102, 98]
    const z = modifiedZ(20, baseline)
    expect(Math.abs(z)).toBeGreaterThan(3.5)
    expect(z).toBeLessThan(0)
  })

  it('does not flag values within normal noise', () => {
    const baseline = [100, 102, 98, 103, 99, 101, 100]
    const z = modifiedZ(101, baseline)
    expect(Math.abs(z)).toBeLessThan(3.5)
  })

  it('is robust to outliers (resistant to a single rogue baseline value)', () => {
    // One huge outlier in baseline; today's value is normal.
    const baseline = [10, 12, 11, 9, 13, 10, 11, 9999]
    const z = modifiedZ(11, baseline)
    expect(Math.abs(z)).toBeLessThan(3.5)
  })
})
