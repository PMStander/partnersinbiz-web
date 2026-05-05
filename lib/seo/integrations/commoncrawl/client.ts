const CDX = process.env.COMMONCRAWL_INDEX ?? 'https://index.commoncrawl.org/CC-MAIN-2025-12-index'

export async function findInboundLinks(targetDomain: string, limit = 100): Promise<string[]> {
  const url = `${CDX}?url=*.${targetDomain}&output=json&limit=${limit}`
  let res
  try {
    res = await fetch(url)
  } catch {
    return []
  }
  if (!res.ok) return []
  const text = await res.text()
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line).url as string
      } catch {
        return null
      }
    })
    .filter((x): x is string => Boolean(x))
}
