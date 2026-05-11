// lib/email-builder/snippet-validate.ts
//
// Validates an EmailSnippet input. Reuses the block validator from
// validate.ts so the same allowed-tag / nesting rules apply.

import type { Block, EmailSnippet, SnippetCategory } from './types'
import { validateDocument } from './validate'

const CATEGORIES: SnippetCategory[] = ['header', 'hero', 'cta', 'footer', 'feature-grid', 'testimonial', 'custom']

export type SnippetValidateResult =
  | {
      ok: true
      value: {
        name: string
        description: string
        category: SnippetCategory
        blocks: Block[]
      }
    }
  | { ok: false; errors: string[] }

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function validateSnippetInput(raw: unknown): SnippetValidateResult {
  const errors: string[] = []
  if (!isObject(raw)) return { ok: false, errors: ['Body must be an object'] }

  const name = typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : ''
  if (!name) errors.push('name is required')

  const description = typeof raw.description === 'string' ? raw.description : ''

  const category: SnippetCategory =
    typeof raw.category === 'string' && (CATEGORIES as string[]).includes(raw.category)
      ? (raw.category as SnippetCategory)
      : 'custom'

  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) {
    errors.push('blocks must be a non-empty array')
    return { ok: false, errors }
  }

  // Reuse the document validator by wrapping the blocks in a throwaway doc.
  const wrapped = validateDocument({
    subject: 'snippet',
    preheader: '',
    theme: { primaryColor: '#000', textColor: '#000', backgroundColor: '#fff', fontFamily: 'sans-serif', contentWidth: 600 },
    blocks: raw.blocks,
  })
  if (!wrapped.ok) {
    return { ok: false, errors: [...errors, ...wrapped.errors] }
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: { name, description, category, blocks: wrapped.doc.blocks },
  }
}

export function snippetCategories(): SnippetCategory[] {
  return CATEGORIES.slice()
}
