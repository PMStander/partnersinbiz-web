const PALETTE = [
  '#60a5fa',
  '#c084fc',
  '#34d399',
  '#fb923c',
  '#f472b6',
  '#a78bfa',
]

function hashProjectId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h
}

export function projectBadgeColor(projectId: string): { text: string; bg: string } {
  const text = PALETTE[hashProjectId(projectId) % PALETTE.length]
  return { text, bg: `${text}1f` }
}
