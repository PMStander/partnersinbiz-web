// lib/email-builder/types.ts
//
// Block-model definitions for the email builder. Every email is a tree of
// blocks rendered to table-based, inline-styled HTML via lib/email-builder/render.ts.
//
// Keep the type discriminator narrow — the renderer + validator + UI all
// switch on `type` and a missing/unknown case should be a TypeScript error.

export type Align = 'left' | 'center' | 'right'

export interface ThemeConfig {
  primaryColor: string
  textColor: string
  backgroundColor: string
  fontFamily: string
  contentWidth: number
}

export interface HeroBlockProps {
  backgroundUrl?: string
  backgroundColor: string
  headline: string
  subhead?: string
  ctaText?: string
  ctaUrl?: string
  ctaColor?: string
  textColor?: string
}

export interface HeadingBlockProps {
  text: string
  level: 1 | 2 | 3
  align: Align
}

export interface ParagraphBlockProps {
  // Limited subset of HTML — only inline tags. The validator strips anything else.
  html: string
  align: Align
}

export interface ButtonBlockProps {
  text: string
  url: string
  color: string
  textColor: string
  align: Align
  fullWidth: boolean
}

export interface ImageBlockProps {
  src: string
  alt: string
  link?: string
  width?: number
  align: Align
}

export interface DividerBlockProps {
  color: string
  thickness: number
}

export interface SpacerBlockProps {
  height: number
}

export interface ColumnsBlockProps {
  // Exactly two columns, each a Block[]. Nested columns are forbidden.
  columns: [Block[], Block[]]
}

export interface SocialLinks {
  twitter?: string
  linkedin?: string
  instagram?: string
  facebook?: string
}

export interface FooterBlockProps {
  orgName: string
  address: string
  unsubscribeUrl: string
  preferencesUrl?: string
  social?: SocialLinks
}

interface BlockBase<T extends string, P> {
  id: string
  type: T
  props: P
}

export type HeroBlock = BlockBase<'hero', HeroBlockProps>
export type HeadingBlock = BlockBase<'heading', HeadingBlockProps>
export type ParagraphBlock = BlockBase<'paragraph', ParagraphBlockProps>
export type ButtonBlock = BlockBase<'button', ButtonBlockProps>
export type ImageBlock = BlockBase<'image', ImageBlockProps>
export type DividerBlock = BlockBase<'divider', DividerBlockProps>
export type SpacerBlock = BlockBase<'spacer', SpacerBlockProps>
export type ColumnsBlock = BlockBase<'columns', ColumnsBlockProps>
export type FooterBlock = BlockBase<'footer', FooterBlockProps>

export type Block =
  | HeroBlock
  | HeadingBlock
  | ParagraphBlock
  | ButtonBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | ColumnsBlock
  | FooterBlock

export type BlockType = Block['type']

export interface EmailDocument {
  subject: string
  preheader: string
  blocks: Block[]
  theme: ThemeConfig
}

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#F5A623',
  textColor: '#0A0A0B',
  backgroundColor: '#F4F4F5',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  contentWidth: 600,
}

// Tiny id generator — no new deps. Good enough for block ids in a document.
export function makeBlockId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
