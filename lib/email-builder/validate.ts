// lib/email-builder/validate.ts
//
// Strict structural validation for EmailDocument values coming over the wire.
// Returns a discriminated union — caller pattern-matches on `ok`. Errors are
// flat strings ("blocks[2].props.text is required") so the API layer can
// return them verbatim.

import type {
  AmpAccordionItem,
  AmpCarouselSlide,
  AmpFormField,
  AmpFormFieldType,
  Block,
  BlockCondition,
  ConditionKind,
  DarkModeMode,
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

const CONDITION_KINDS: ConditionKind[] = [
  'always',
  'has-tag',
  'not-has-tag',
  'at-stage',
  'not-at-stage',
  'has-field',
  'field-equals',
  'field-not-empty',
]

// Returns a validated BlockCondition or `undefined` if `raw` is absent.
// Unknown kinds are coerced to 'always' rather than failing (additive
// compatibility: a future kind value shouldn't break older renderers).
function validateCondition(raw: unknown): BlockCondition | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isObject(raw)) return undefined
  const kind: ConditionKind = (CONDITION_KINDS as string[]).includes(raw.kind as string)
    ? (raw.kind as ConditionKind)
    : 'always'
  const out: BlockCondition = { kind }
  if (isString(raw.tag)) out.tag = raw.tag
  if (isString(raw.stage)) out.stage = raw.stage
  if (isString(raw.field)) out.field = raw.field
  if (isString(raw.value)) out.value = raw.value
  return out
}

function validateTheme(theme: unknown, errors: string[], path = 'theme'): ThemeConfig | null {
  if (!isObject(theme)) {
    errors.push(`${path} must be an object`)
    return null
  }
  // darkMode is optional. Only 'auto' | 'force-light' are accepted —
  // anything else falls back to undefined (renderer treats as 'auto').
  let darkMode: DarkModeMode | undefined
  if (theme.darkMode === 'auto' || theme.darkMode === 'force-light') {
    darkMode = theme.darkMode
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
  if (darkMode) out.darkMode = darkMode
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
  const condition = validateCondition(raw.condition)

  // Helper to attach condition only when present, preserving the old shape
  // for blocks that don't specify one (backwards-compatible storage).
  const withCondition = <B extends Block>(b: B): B =>
    condition ? ({ ...b, condition } as B) : b

  switch (type) {
    case 'hero': {
      if (!isString(props.backgroundColor)) errors.push(`${path}.props.backgroundColor is required`)
      if (!isString(props.headline)) errors.push(`${path}.props.headline is required`)
      return withCondition({
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
      })
    }
    case 'heading': {
      if (!isString(props.text)) errors.push(`${path}.props.text is required`)
      const level = props.level === 1 || props.level === 2 || props.level === 3 ? props.level : 2
      const align = isAlign(props.align) ? props.align : 'left'
      return withCondition({ id, type: 'heading', props: { text: isString(props.text) ? props.text : '', level, align } })
    }
    case 'paragraph': {
      if (!isString(props.html)) errors.push(`${path}.props.html is required`)
      const align = isAlign(props.align) ? props.align : 'left'
      return withCondition({ id, type: 'paragraph', props: { html: isString(props.html) ? props.html : '', align } })
    }
    case 'button': {
      if (!isString(props.text)) errors.push(`${path}.props.text is required`)
      if (!isString(props.url)) errors.push(`${path}.props.url is required`)
      return withCondition({
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
      })
    }
    case 'image': {
      if (!isString(props.src)) errors.push(`${path}.props.src is required`)
      return withCondition({
        id,
        type: 'image',
        props: {
          src: isString(props.src) ? props.src : '',
          alt: isString(props.alt) ? props.alt : '',
          link: isString(props.link) ? props.link : undefined,
          width: isNumber(props.width) ? props.width : undefined,
          align: isAlign(props.align) ? props.align : 'center',
        },
      })
    }
    case 'divider': {
      return withCondition({
        id,
        type: 'divider',
        props: {
          color: isString(props.color) ? props.color : '#e5e7eb',
          thickness: isNumber(props.thickness) ? props.thickness : 1,
        },
      })
    }
    case 'spacer': {
      return withCondition({
        id,
        type: 'spacer',
        props: {
          height: isNumber(props.height) ? props.height : 24,
        },
      })
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
      return withCondition({ id, type: 'columns', props: { columns: [lOut, rOut] } })
    }
    case 'footer': {
      if (!isString(props.orgName)) errors.push(`${path}.props.orgName is required`)
      if (!isString(props.address)) errors.push(`${path}.props.address is required`)
      if (!isString(props.unsubscribeUrl)) errors.push(`${path}.props.unsubscribeUrl is required`)
      const socialRaw = isObject(props.social) ? props.social : null
      return withCondition({
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
      })
    }
    case 'amp-carousel': {
      const slidesRaw = Array.isArray(props.slides) ? props.slides : []
      if (slidesRaw.length === 0) {
        errors.push(`${path}.props.slides must be a non-empty array`)
      }
      const slides: AmpCarouselSlide[] = []
      slidesRaw.forEach((s: unknown, i: number) => {
        if (!isObject(s)) {
          errors.push(`${path}.props.slides[${i}] must be an object`)
          return
        }
        if (!isString(s.imageUrl)) {
          errors.push(`${path}.props.slides[${i}].imageUrl is required`)
        }
        slides.push({
          imageUrl: isString(s.imageUrl) ? s.imageUrl : '',
          alt: isString(s.alt) ? s.alt : '',
          linkUrl: isString(s.linkUrl) ? s.linkUrl : undefined,
        })
      })
      const autoAdvance =
        isNumber(props.autoAdvance) && props.autoAdvance >= 1000 ? props.autoAdvance : undefined
      return withCondition({
        id,
        type: 'amp-carousel',
        props: { slides, autoAdvance },
      })
    }
    case 'amp-accordion': {
      const itemsRaw = Array.isArray(props.items) ? props.items : []
      if (itemsRaw.length === 0) {
        errors.push(`${path}.props.items must be a non-empty array`)
      }
      const items: AmpAccordionItem[] = []
      itemsRaw.forEach((it: unknown, i: number) => {
        if (!isObject(it)) {
          errors.push(`${path}.props.items[${i}] must be an object`)
          return
        }
        if (!isString(it.heading)) {
          errors.push(`${path}.props.items[${i}].heading is required`)
        }
        items.push({
          heading: isString(it.heading) ? it.heading : '',
          bodyHtml: isString(it.bodyHtml) ? it.bodyHtml : '',
        })
      })
      return withCondition({ id, type: 'amp-accordion', props: { items } })
    }
    case 'amp-form': {
      if (!isString(props.submitUrl)) errors.push(`${path}.props.submitUrl is required`)
      const fieldsRaw = Array.isArray(props.fields) ? props.fields : []
      if (fieldsRaw.length === 0) {
        errors.push(`${path}.props.fields must be a non-empty array`)
      }
      const fields: AmpFormField[] = []
      fieldsRaw.forEach((f: unknown, i: number) => {
        if (!isObject(f)) {
          errors.push(`${path}.props.fields[${i}] must be an object`)
          return
        }
        if (!isString(f.key) || !f.key.trim()) {
          errors.push(`${path}.props.fields[${i}].key is required`)
        }
        const fType: AmpFormFieldType = f.type === 'email' ? 'email' : 'text'
        fields.push({
          key: isString(f.key) ? f.key : '',
          label: isString(f.label) ? f.label : '',
          type: fType,
        })
      })
      return withCondition({
        id,
        type: 'amp-form',
        props: {
          fields,
          submitUrl: isString(props.submitUrl) ? props.submitUrl : '',
          successMessage: isString(props.successMessage) ? props.successMessage : 'Thanks!',
          buttonText: isString(props.buttonText) ? props.buttonText : 'Submit',
        },
      })
    }
    case 'amp-live-data': {
      if (!isString(props.endpoint)) errors.push(`${path}.props.endpoint is required`)
      return withCondition({
        id,
        type: 'amp-live-data',
        props: {
          endpoint: isString(props.endpoint) ? props.endpoint : '',
          template: isString(props.template) ? props.template : '',
        },
      })
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
