import type { FC } from 'react'
import type { DocumentBlock, DocumentBlockType } from '@/lib/client-documents/types'
import { UnknownBlock } from './UnknownBlock'
import { UnknownEditor } from './editors/UnknownEditor'
import { HeroBlock } from './HeroBlock'
import { HeroEditor } from './editors/HeroEditor'
import { SummaryBlock } from './SummaryBlock'
import { SummaryEditor } from './editors/SummaryEditor'

type RendererProps = { block: DocumentBlock; index: number }
type EditorProps = { block: DocumentBlock; onChange: (b: DocumentBlock) => void }

export const BLOCK_RENDERERS: Partial<Record<DocumentBlockType, FC<RendererProps>>> = {
  hero: HeroBlock,
  summary: SummaryBlock,
}

export const BLOCK_EDITORS: Partial<Record<DocumentBlockType, FC<EditorProps>>> = {
  hero: HeroEditor,
  summary: SummaryEditor,
}

export function getRenderer(type: DocumentBlockType): FC<RendererProps> {
  return BLOCK_RENDERERS[type] ?? UnknownBlock
}

export function getEditor(type: DocumentBlockType): FC<EditorProps> {
  return BLOCK_EDITORS[type] ?? UnknownEditor
}

export { BlockFrame } from './BlockFrame'
