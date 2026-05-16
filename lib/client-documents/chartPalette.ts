function shiftHue(hex: string, deg: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const r = parseInt(m[1].slice(0, 2), 16) / 255
  const g = parseInt(m[1].slice(2, 4), 16) / 255
  const b = parseInt(m[1].slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const s = max === min ? 0 : (max - min) / (l > 0.5 ? 2 - max - min : max + min)
  if (max !== min) {
    if (max === r) h = ((g - b) / (max - min) + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / (max - min) + 2) / 6
    else h = ((r - g) / (max - min) + 4) / 6
  }
  h = (((h * 360 + deg + 360) % 360) / 360)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const toRgb = (t: number) => {
    t = (t + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 0.5) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const r2 = Math.round(toRgb(h + 1 / 3) * 255)
    .toString(16)
    .padStart(2, '0')
  const g2 = Math.round(toRgb(h) * 255)
    .toString(16)
    .padStart(2, '0')
  const b2 = Math.round(toRgb(h - 1 / 3) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${r2}${g2}${b2}`
}

export function chartPalette(accent: string, n = 5): string[] {
  if (n <= 1) return [accent]
  return Array.from({ length: n }, (_, i) =>
    i === 0 ? accent : shiftHue(accent, (i * 360) / n),
  )
}
