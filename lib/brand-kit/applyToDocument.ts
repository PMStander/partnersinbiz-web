// lib/brand-kit/applyToDocument.ts
//
// Apply a BrandKit to an EmailDocument: theme colors / fonts, plus fill in
// empty footer-block defaults (orgName, address, social links).
//
// Pure function — returns a new document. Never mutates the input.

import type { BrandKit } from './types'
import type {
  Block,
  ColumnsBlock,
  EmailDocument,
  FooterBlock,
  SocialLinks,
} from '@/lib/email-builder/types'

function applyFooter(block: FooterBlock, kit: BrandKit): FooterBlock {
  const social: SocialLinks = { ...(block.props.social ?? {}) }
  // Only fill empty social fields — never overwrite something the user set
  // explicitly on the template.
  if (!social.twitter && kit.social.twitter) social.twitter = kit.social.twitter
  if (!social.linkedin && kit.social.linkedin) social.linkedin = kit.social.linkedin
  if (!social.instagram && kit.social.instagram) social.instagram = kit.social.instagram
  if (!social.facebook && kit.social.facebook) social.facebook = kit.social.facebook

  return {
    ...block,
    props: {
      ...block.props,
      orgName: block.props.orgName?.trim() ? block.props.orgName : kit.brandName,
      address: block.props.address?.trim() ? block.props.address : kit.postalAddress,
      social,
    },
  }
}

function applyToBlock(block: Block, kit: BrandKit): Block {
  if (block.type === 'footer') {
    return applyFooter(block, kit)
  }
  if (block.type === 'columns') {
    const col0 = block.props.columns[0].map((b) => applyToBlock(b, kit))
    const col1 = block.props.columns[1].map((b) => applyToBlock(b, kit))
    const updated: ColumnsBlock = {
      ...block,
      props: { ...block.props, columns: [col0, col1] },
    }
    return updated
  }
  return block
}

/**
 * Returns a new EmailDocument with the brand-kit applied:
 *
 *   - theme.primaryColor   ← kit.primaryColor
 *   - theme.textColor      ← kit.textColor
 *   - theme.backgroundColor ← kit.backgroundColor
 *   - theme.fontFamily     ← kit.fontFamilyPrimary
 *   - footer blocks get kit.brandName / kit.postalAddress / kit.social
 *     filled in for any EMPTY fields (existing values are preserved).
 *
 * Does NOT mutate `doc`.
 */
export function applyBrandKitToTheme(doc: EmailDocument, kit: BrandKit): EmailDocument {
  return {
    ...doc,
    theme: {
      ...doc.theme,
      primaryColor: kit.primaryColor || doc.theme.primaryColor,
      textColor: kit.textColor || doc.theme.textColor,
      backgroundColor: kit.backgroundColor || doc.theme.backgroundColor,
      fontFamily: kit.fontFamilyPrimary || doc.theme.fontFamily,
    },
    blocks: doc.blocks.map((b) => applyToBlock(b, kit)),
  }
}
