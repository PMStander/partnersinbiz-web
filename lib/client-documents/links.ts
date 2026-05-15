import type { ClientDocument, ClientDocumentLinkSet } from './types'

export function documentLinksTo(
  entity: keyof ClientDocumentLinkSet,
  id: string,
  doc: Pick<ClientDocument, 'linked'>,
): boolean {
  const value = doc.linked?.[entity]
  if (Array.isArray(value)) return value.includes(id)
  return value === id
}

export function mergeDocumentLinks(current: ClientDocumentLinkSet, next: ClientDocumentLinkSet): ClientDocumentLinkSet {
  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ),
  }
}
