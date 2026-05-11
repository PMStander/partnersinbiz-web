// lib/email-builder/validate.ts
//
// Strict structural validation for EmailDocument values coming over the wire.
// Returns a discriminated union — caller pattern-matches on `ok`. Errors are
// flat strings ("blocks[2].props.text is required") so the API layer can
// return them verbatim.

import type {
  Block,
  EmailDocument,
  ThemeConfig,
} from './types'

const MAX_BLOCKS = 100

export type ValidateResult =
  | { ok: true; doc: EmailDocument }
  | { ok: false; errors: string[] }

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isAlign(v: unknown): v is 'left' | 'center' | 'right' {
  return v === 'left' || v === 'center' || v === 'right'
}

function validateTheme(theme: unknown, errors: string[], path = 'theme'): ThemeConfig | null {
  if (!isObject(theme)) {
    errors.push(`${path} must be an object`)
    return null
  }
  const out: ThemeConfig = {
    primaryColor: isNonEmptyString(theme.primaryColor) ? theme.primaryColor : '#F5A623',
    textColor: isNonEmptyString(theme.textColor) ? theme.textColor : '#0A0A0B',
    backgroundColor: isNonEmptyString(theme.backgroundColor) ? theme.backgroundColor : '#F4F4F5',
    fontFamily: isNonEmptyString(theme.fontFamily)
      ? theme.fontFamily
      : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    contentWidth: isNumber(theme.contentWidth) ? theme.contentWidth : 600,
  }
  return out
}

function validateBlock(raw: unknown, path: string, errors: string[], depth: number, totalCount: { n: number }): Block | null {
  totalCount.n += 1
  if (totalCount.n > MAX_BLOCKS) {
    errors.push(`Too many blocks (max ${MAX_BLOCKS})`)
    return null
  }
  if (!isObject(raw)) {
    errors.push(`${path} must be an object`)
    return null
  }
  if (!isNonEmptyString(raw.id)) {
    errors.push(`${path}.id is required`)
    return null
  }
  if (!isNonEmptyString(raw.type)) {
    errors.push(`${path}.type is required`)
    return null
  }
  const props = raw.props
  if (!isObject(props)) {
    errors.push(`${path}.props must be an object`)
    return null
  }

  const id = raw.id
  const type = raw.type

  switch (type) {
    case 'hero': {
      if (!isString(props.backgroundColor)) errors.push(`${path}.props.backgroundColor is required`)
      if (!isString(props.headline)) errors.push(`${path}.props.headline is required`)
      return {
        id,
        type: 'hero',
        props: {
          backgroundUrl: isString(props.backgroundUrl) ? props.backgroundUrl : undefined,
          backgroundColor: isString(props.backgroundColor) ? props.backgroundColor : '#0A0A0B',
          headline: isString(props.headline) ? props.headline : '',
          subhead: isString(props.subhead) ? props.subhead : undefined,
          ctaText: isString(props.ctaText) ? props.ctaText : undefined,
          ctaUrl: isString(props.ctaUrl) ? props.ctaUrl : undefined,
          ctaColor: isString(props.ctaColor) ? props.ctaColor : undefined,
          textColor: isString(props.textColor) ? props.textColor : undefined,
        },
      }
    }
    case 'heading': {
      if (!isString(props.text)) errors.push(`${path}.props.text is required`)
      const level = props.level === 1 || props.level === 2 || props.level === 3 ? props.level : 2
      const align = isAlign(props.align) ? props.align : 'left'
      return { id, type: 'heading', props: { text: isString(props.text) ? props.text : '', level, align } }
    }
    case 'paragraph': {
      if (!isString(props.html)) errors.push(`${path}.props.html is required`)
      const align = isAlign(props.align) ? props.align : 'left'
      return { id, type: 'paragraph', props: { html: isString(props.html) ? props.html : '', align } }
    }
    case 'button': {
      if (!isString(props.text)) errors.push(`${path}.props.text is required`)
      if (!isString(props.url)) errors.push(`${path}.props.url is required`)
      return {
        id,
        type: 'button',
        props: {
          text: isString(props.text) ? props.text : '',
          url: isString(props.url) ? props.url : '',
          color: isString(props.color) ? props.color : '#F5A623',
          textColor: isString(props.textColor) ? props.textColor : '#0A0A0B',
          align: isAlign(props.align) ? props.align : 'center',
          fullWidth: props.fullWidth === true,
        },
      }
    }
    case 'image': {
      if (!isString(props.src)) errors.push(`${path}.props.src is required`)
      return {
        id,
        type: 'image',
        props: {
          src: isString(props.src) ? props.src : '',
          alt: isString(props.alt) ? props.alt : '',
          link: isString(props.link) ? props.link : undefined,
          width: isNumber(props.width) ? props.width : undefined,
          align: isAlign(props.align) ? props.align : 'center',
        },
      }
    }
    case 'divider': {
      return {
        id,
        type: 'divider',
        props: {
          color: isString(props.color) ? props.color : '#e5e7eb',
          thickness: isNumber(props.thickness) ? props.thickness : 1,
        },
      }
    }
    case 'spacer': {
      return {
        id,
        type: 'spacer',
        props: {
          height: isNumber(props.height) ? props.height : 24,
        },
      }
    }
    case 'columns': {
      if (depth >= 1) {
        errors.push(`${path}: columns cannot be nested`)
        return null
      }
      if (!Array.isArray(props.columns) || props.columns.length !== 2) {
        errors.push(`${path}.props.columns must be a length-2 array`)
        return null
      }
      const left = Array.isArray(props.columns[0]) ? props.columns[0] : []
      const right = Array.isArray(props.columns[1]) ? props.columns[1] : []
      const lOut: Block[] = []
      const rOut: Block[] = []
      left.forEach((b, i) => {
        const v = validateBlock(b, `${path}.props.columns[0][${i}]`, errors, depth + 1, totalCount)
        if (v) lOut.push(v)
      })
      right.forEach((b, i) => {
        const v = validateBlock(b, `${path}.props.columns[1][${i}]`, errors, depth + 1, totalCount)
        if (v) rOut.push(v)
      })
      return { id, type: 'columns', props: { columns: [lOut, rOut] } }
    }
    case 'footer': {
      if (!isString(props.orgName)) errors.push(`${path}.props.orgName is required`)
      if (!isString(props.address)) errors.push(`${path}.props.address is required`)
      if (!isString(props.unsubscribeUrl)) errors.push(`${path}.props.unsubscribeUrl is required`)
      const socialRaw = isObject(props.social) ? props.social : null
      return {
        id,
        type: 'footer',
        props: {
          orgName: isString(props.orgName) ? props.orgName : '',
          address: isString(props.address) ? props.address : '',
          unsubscribeUrl: isString(props.unsubscribeUrl) ? props.unsubscribeUrl : '',
          preferencesUrl: isString(props.preferencesUrl) ? props.preferencesUrl : undefined,
          social: socialRaw
            ? {
                twitter: isString(socialRaw.twitter) ? socialRaw.twitter : undefined,
                linkedin: isString(socialRaw.linkedin) ? socialRaw.linkedin : undefined,
                instagram: isString(socialRaw.instagram) ? socialRaw.instagram : undefined,
                facebook: isString(socialRaw.facebook) ? socialRaw.facebook : undefined,
              }
            : undefined,
        },
      }
    }
    default:
      errors.push(`${path}.type "${type}" is not a known block type`)
      return null
  }
}

export function validateDocument(doc: unknown): ValidateResult {
  const errors: string[] = []
  if (!isObject(doc)) {
    return { ok: false, errors: ['document must be an object'] }
  }
  if (!isString(doc.subject)) errors.push('subject is required')
  if (!isString(doc.preheader)) errors.push('preheader is required')
  if (!Array.isArray(doc.blocks)) {
    errors.push('blocks must be an array')
    return { ok: false, errors }
  }

  const theme = validateTheme(doc.theme, errors)
  const blocks: Block[] = []
  const counter = { n: 0 }
  doc.blocks.forEach((b, i) => {
    const v = validateBlock(b, `blocks[${i}]`, errors, 0, counter)
    if (v) blocks.push(v)
  })

  if (errors.length > 0 || !theme) {
    return { ok: false, errors: errors.length > 0 ? errors : ['theme is required'] }
  }

  return {
    ok: true,
    doc: {
      subject: isString(doc.subject) ? doc.subject : '',
      preheader: isString(doc.preheader) ? doc.preheader : '',
      blocks,
      theme,
    },
  }
}
