import type { FC } from 'react'
import type { DocumentBlock, DocumentBlockType } from '@/lib/client-documents/types'
import { UnknownBlock } from './UnknownBlock'
import { UnknownEditor } from './editors/UnknownEditor'
import { HeroBlock } from './HeroBlock'
import { HeroEditor } from './editors/HeroEditor'
import { SummaryBlock } from './SummaryBlock'
import { SummaryEditor } from './editors/SummaryEditor'
import { ProblemBlock } from './ProblemBlock'
import { ProblemEditor } from './editors/ProblemEditor'
import { ScopeBlock } from './ScopeBlock'
import { ScopeEditor } from './editors/ScopeEditor'
import { DeliverablesBlock } from './DeliverablesBlock'
import { DeliverablesEditor } from './editors/DeliverablesEditor'
import { TermsBlock } from './TermsBlock'
import { TermsEditor } from './editors/TermsEditor'

type RendererProps = { block: DocumentBlock; index: number }
type EditorProps = { block: DocumentBlock; onChange: (b: DocumentBlock) => void }

export const BLOCK_RENDERERS: Partial<Record<DocumentBlockType, FC<RendererProps>>> = {
  hero: HeroBlock,
  summary: SummaryBlock,
  problem: ProblemBlock,
  scope: ScopeBlock,
  deliverables: DeliverablesBlock,
  terms: TermsBlock,
}

export const BLOCK_EDITORS: Partial<Record<DocumentBlockType, FC<EditorProps>>> = {
  hero: HeroEditor,
  summary: SummaryEditor,
  problem: ProblemEditor,
  scope: ScopeEditor,
  deliverables: DeliverablesEditor,
  terms: TermsEditor,
}

export function getRenderer(type: DocumentBlockType): FC<RendererProps> {
  return BLOCK_RENDERERS[type] ?? UnknownBlock
}

export function getEditor(type: DocumentBlockType): FC<EditorProps> {
  return BLOCK_EDITORS[type] ?? UnknownEditor
}

export { BlockFrame } from './BlockFrame'
