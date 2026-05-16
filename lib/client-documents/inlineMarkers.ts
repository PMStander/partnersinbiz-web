import type { DocumentComment } from './types'

const MARK_ATTR = 'data-doc-comment-id'
const IMG_BADGE_ATTR = 'data-doc-comment-image-badge'
const BLOCK_BADGE_ATTR = 'data-doc-comment-block-badge'

export function clearInlineMarkers(root: HTMLElement) {
  root.querySelectorAll(`mark[${MARK_ATTR}]`).forEach((el) => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
    parent.normalize()
  })
  root.querySelectorAll(`[${IMG_BADGE_ATTR}]`).forEach((el) => el.remove())
  root.querySelectorAll(`[${BLOCK_BADGE_ATTR}]`).forEach((el) => el.remove())
}

function findTextNode(scope: HTMLElement, needle: string): { node: Text; index: number } | null {
  if (!needle) return null
  const walker = (scope.ownerDocument ?? document).createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parentTag = (node.parentElement?.tagName ?? '').toLowerCase()
      if (parentTag === 'script' || parentTag === 'style' || parentTag === 'mark') {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let n: Node | null = walker.nextNode()
  while (n) {
    const text = n.nodeValue ?? ''
    const idx = text.indexOf(needle)
    if (idx >= 0) return { node: n as Text, index: idx }
    n = walker.nextNode()
  }
  return null
}

function wrapTextRange(textNode: Text, start: number, length: number, commentId: string, status: string) {
  const before = textNode.splitText(start)
  before.splitText(length)
  const mark = textNode.ownerDocument.createElement('mark')
  mark.setAttribute(MARK_ATTR, commentId)
  mark.setAttribute('data-doc-comment-status', status)
  mark.style.background = status === 'resolved' ? 'rgba(74,222,128,0.18)' : 'rgba(245,166,35,0.32)'
  mark.style.color = 'inherit'
  mark.style.borderRadius = '2px'
  mark.style.padding = '0 2px'
  mark.style.cursor = 'pointer'
  before.parentNode?.replaceChild(mark, before)
  mark.appendChild(before)
  return mark
}

function ensureBlockBadge(blockEl: HTMLElement, count: number, openCount: number) {
  let badge = blockEl.querySelector<HTMLElement>(`[${BLOCK_BADGE_ATTR}]`)
  if (!badge) {
    badge = blockEl.ownerDocument.createElement('button')
    badge.setAttribute(BLOCK_BADGE_ATTR, '1')
    badge.setAttribute('type', 'button')
    badge.style.position = 'absolute'
    badge.style.top = '8px'
    badge.style.right = '8px'
    badge.style.fontSize = '11px'
    badge.style.padding = '2px 8px'
    badge.style.borderRadius = '9999px'
    badge.style.fontFamily = 'var(--font-mono, monospace)'
    badge.style.cursor = 'pointer'
    badge.style.zIndex = '5'
    badge.style.border = '1px solid rgba(245,166,35,0.4)'
    badge.style.background = 'rgba(245,166,35,0.12)'
    badge.style.color = 'var(--doc-accent, #F5A623)'
    if (getComputedStyle(blockEl).position === 'static') {
      blockEl.style.position = 'relative'
    }
    blockEl.appendChild(badge)
  }
  badge.textContent = openCount > 0 ? `${openCount} open${count > openCount ? ` / ${count}` : ''}` : `${count} resolved`
  badge.setAttribute('data-block-badge-count', String(count))
}

function ensureImageBadge(img: HTMLImageElement, commentId: string, status: string) {
  const wrapperHost = img.parentElement
  if (!wrapperHost) return
  if (getComputedStyle(wrapperHost).position === 'static') {
    wrapperHost.style.position = 'relative'
  }
  const badge = img.ownerDocument.createElement('button')
  badge.setAttribute(IMG_BADGE_ATTR, commentId)
  badge.setAttribute('type', 'button')
  badge.style.position = 'absolute'
  badge.style.top = '8px'
  badge.style.left = '8px'
  badge.style.fontSize = '11px'
  badge.style.padding = '4px 10px'
  badge.style.borderRadius = '9999px'
  badge.style.background = status === 'resolved' ? 'rgba(74,222,128,0.9)' : 'rgba(245,166,35,0.95)'
  badge.style.color = '#0A0A0B'
  badge.style.fontWeight = '600'
  badge.style.cursor = 'pointer'
  badge.style.zIndex = '5'
  badge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)'
  badge.textContent = '💬'
  wrapperHost.appendChild(badge)
}

export function applyInlineMarkers(root: HTMLElement, comments: DocumentComment[]) {
  clearInlineMarkers(root)

  const byBlock = new Map<string, DocumentComment[]>()
  for (const c of comments) {
    if (!c.blockId) continue
    const arr = byBlock.get(c.blockId) ?? []
    arr.push(c)
    byBlock.set(c.blockId, arr)
  }

  for (const [blockId, blockComments] of byBlock.entries()) {
    const blockEl = root.querySelector<HTMLElement>(`#block-${blockId}`)
    if (!blockEl) continue

    for (const c of blockComments) {
      if (c.anchor?.type === 'text') {
        const hit = findTextNode(blockEl, c.anchor.text)
        if (hit) wrapTextRange(hit.node, hit.index, c.anchor.text.length, c.id, c.status)
      } else if (c.anchor?.type === 'image') {
        const imgs = blockEl.querySelectorAll<HTMLImageElement>('img')
        for (const img of imgs) {
          if (img.src === c.anchor.mediaUrl || img.getAttribute('src') === c.anchor.mediaUrl) {
            ensureImageBadge(img, c.id, c.status)
            break
          }
        }
      }
    }

    const openCount = blockComments.filter((c) => c.status !== 'resolved').length
    ensureBlockBadge(blockEl, blockComments.length, openCount)
  }
}

export function findBlockIdForNode(node: Node | null): string | null {
  let current: Node | null = node
  while (current && current.nodeType !== Node.ELEMENT_NODE) current = current.parentNode
  let el = current as HTMLElement | null
  while (el && el !== document.body) {
    if (el.id && el.id.startsWith('block-')) return el.id.slice('block-'.length)
    el = el.parentElement
  }
  return null
}
