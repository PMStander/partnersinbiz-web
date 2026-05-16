import type { FC } from 'react'
import type { DocumentBlock, DocumentBlockType } from '@/lib/client-documents/types'
import { UnknownBlock } from './UnknownBlock'
import { UnknownEditor } from './editors/UnknownEditor'
import { HeroBlock } from './HeroBlock'
import { HeroEditor } from './editors/HeroEditor'

type RendererProps = { block: DocumentBlock; index: number }
type EditorProps = { block: DocumentBlock; onChange: (b: DocumentBlock) => void }

export const BLOCK_RENDERERS: Partial<Record<DocumentBlockType, FC<RendererProps>>> = {
  hero: HeroBlock,
}

export const BLOCK_EDITORS: Partial<Record<DocumentBlockType, FC<EditorProps>>> = {
  hero: HeroEditor,
}

export function getRenderer(type: DocumentBlockType): FC<RendererProps> {
  return BLOCK_RENDERERS[type] ?? UnknownBlock
}

export function getEditor(type: DocumentBlockType): FC<EditorProps> {
  return BLOCK_EDITORS[type] ?? UnknownEditor
}

export { BlockFrame } from './BlockFrame'
