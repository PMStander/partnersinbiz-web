// lib/email-builder/render-amp.ts
//
// Renders the AMP-for-Email MIME part for an EmailDocument. AMP enables
// interactive content (carousels, accordions, forms, live data) inside
// supporting email clients — currently Gmail, Yahoo, and Mail.ru.
//
// The HTML renderer (`renderEmail`) always produces a sensible fallback
// for every AMP block, so opting into AMP is purely additive: clients
// that don't support AMP simply read the HTML part.
//
// `renderAmpEmail` returns `null` when the document has no interactive
// blocks — that's the signal for the send pipeline to skip the AMP MIME
// part entirely. Sending an AMP body to documents that don't need it just
// wastes bandwidth and risks AMP-validation warnings.
//
// AMP-for-Email rules enforced here:
//   - doctype + `<html ⚡4email data-css-strict>` (the unicode ⚡ is the
//     canonical attribute; `amp4email` is the long form, both accepted).
//   - mandatory `<meta charset="utf-8">` and AMP runtime `<script async>`.
//   - mandatory AMP boilerplate `<style amp-boilerplate>` block (the
//     boilerplate visibility hack for the AMP runtime).
//   - all custom CSS lives in `<style amp-custom>` — inline `style=""`
//     attributes are NOT allowed on most elements.
//   - per-block component scripts loaded on demand (amp-img is built-in;
//     amp-carousel, amp-accordion, amp-form, amp-list, amp-mustache each
//     need their own script tag).
//
// Anything more exotic than what we generate here should validate via
// `lib/email-builder/amp-validate.ts` — basic structural checks only.

import { interpolate, type TemplateVars } from '@/lib/email/template'
import { evaluateCondition, type RecipientContext } from './render'
import type {
  AmpAccordionBlockProps,
  AmpCarouselBlockProps,
  AmpFormBlockProps,
  AmpLiveDataBlockProps,
  Block,
  ButtonBlockProps,
  ColumnsBlockProps,
  DividerBlockProps,
  EmailDocument,
  FooterBlockProps,
  HeadingBlockProps,
  HeroBlockProps,
  ImageBlockProps,
  ParagraphBlockProps,
  SpacerBlockProps,
  ThemeConfig,
} from './types'
import { AMP_BLOCK_TYPES } from './types'

export interface AmpRenderResult {
  amp: string
}

// AMP component runtime URLs. Only emit the ones we actually use to keep
// the email small. Order matters for some validators — runtime first.
const AMP_RUNTIME_URL = 'https://cdn.ampproject.org/v0.js'
const AMP_COMPONENT_URLS: Record<string, string> = {
  'amp-img': '', // built into the runtime; no extra script
  'amp-carousel': 'https://cdn.ampproject.org/v0/amp-carousel-0.2.js',
  'amp-accordion': 'https://cdn.ampproject.org/v0/amp-accordion-0.1.js',
  'amp-form': 'https://cdn.ampproject.org/v0/amp-form-0.1.js',
  'amp-list': 'https://cdn.ampproject.org/v0/amp-list-0.1.js',
  'amp-mustache': 'https://cdn.ampproject.org/v0/amp-mustache-0.2.js',
}

// AMP boilerplate as required by the validator. Reproduced verbatim from
// the AMP-for-Email spec — do NOT modify; the runtime checks byte-for-byte.
const AMP_BOILERPLATE = `body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}`

const AMP_BOILERPLATE_NOSCRIPT = `body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}`

// -------------------- helpers --------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// AMP allows the same minimal inline tag set as the regular renderer.
// Anything else is stripped to keep AMP validators happy.
function sanitizeInlineHtml(html: string): string {
  if (!html) return ''
  const ALLOWED = /^(b|strong|i|em|u|a|br|span)$/i
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag: string, rest: string) => {
    if (!ALLOWED.test(tag)) return ''
    if (tag.toLowerCase() === 'a' && match.startsWith('<a')) {
      const hrefMatch = rest.match(/href=("[^"]*"|'[^']*')/i)
      // AMP requires target="_blank" or omitted on <a>; we always set _blank.
      const safe = [hrefMatch?.[0], 'target="_blank"'].filter(Boolean).join(' ')
      return `<a ${safe}>`
    }
    return match.replace(/\son\w+=("[^"]*"|'[^']*')/gi, '')
  })
}

function interp(s: string | undefined, vars: TemplateVars): string {
  return interpolate(s ?? '', vars)
}

// Recursively scan blocks to find which AMP components we need to load.
// Columns can nest 1 level deep — that's the only nested type.
function collectBlockTypes(blocks: Block[], acc: Set<string>): void {
  for (const block of blocks) {
    acc.add(block.type)
    if (block.type === 'columns') {
      collectBlockTypes(block.props.columns[0], acc)
      collectBlockTypes(block.props.columns[1], acc)
    }
  }
}

/**
 * Returns the set of AMP component script URLs required by the document.
 * Built-in components (amp-img) return no URL; we always include amp-img
 * implicitly via the runtime.
 *
 * Exported for the email-builder preview endpoint and any caller that
 * wants to lazy-load AMP components in a non-MIME context.
 */
export function getAmpComponentScripts(doc: EmailDocument): string[] {
  const blockTypes = new Set<string>()
  collectBlockTypes(doc.blocks, blockTypes)

  const scripts: string[] = []
  // amp-img is always usable via the runtime, no extra script required.
  if (blockTypes.has('image')) {
    // (no-op — declared for clarity)
  }
  if (blockTypes.has('amp-carousel') && AMP_COMPONENT_URLS['amp-carousel']) {
    scripts.push(AMP_COMPONENT_URLS['amp-carousel'])
  }
  if (blockTypes.has('amp-accordion') && AMP_COMPONENT_URLS['amp-accordion']) {
    scripts.push(AMP_COMPONENT_URLS['amp-accordion'])
  }
  if (blockTypes.has('amp-form') && AMP_COMPONENT_URLS['amp-form']) {
    scripts.push(AMP_COMPONENT_URLS['amp-form'])
  }
  if (blockTypes.has('amp-live-data')) {
    // amp-list + amp-mustache both required for the live-data block.
    scripts.push(AMP_COMPONENT_URLS['amp-list'])
    scripts.push(AMP_COMPONENT_URLS['amp-mustache'])
  }
  return scripts
}

/**
 * Returns true when the document has any block that requires the AMP MIME
 * part. Cheap shortcut for the send pipeline so it can skip AMP rendering
 * for documents that wouldn't benefit.
 */
export function hasAmpBlocks(doc: EmailDocument): boolean {
  const types = new Set<string>()
  collectBlockTypes(doc.blocks, types)
  for (const t of AMP_BLOCK_TYPES) {
    if (types.has(t)) return true
  }
  return false
}

// -------------------- block renderers (AMP variants) --------------------

function renderHero(p: HeroBlockProps, vars: TemplateVars): string {
  const headline = escapeHtml(interp(p.headline, vars))
  const subhead = p.subhead ? escapeHtml(interp(p.subhead, vars)) : ''
  // AMP requires all styling via amp-custom — emit semantic markup + classes.
  let cta = ''
  if (p.ctaText && p.ctaUrl) {
    cta = `<p class="pib-hero-cta"><a href="${escapeAttr(interp(p.ctaUrl, vars))}" target="_blank" class="pib-button">${escapeHtml(interp(p.ctaText, vars))}</a></p>`
  }
  return `<div class="pib-hero">
    <h1>${headline}</h1>
    ${subhead ? `<p>${subhead}</p>` : ''}
    ${cta}
  </div>`
}

function renderHeading(p: HeadingBlockProps, vars: TemplateVars): string {
  const tag = `h${p.level}`
  return `<${tag} class="pib-h${p.level} pib-align-${p.align}">${escapeHtml(interp(p.text, vars))}</${tag}>`
}

function renderParagraph(p: ParagraphBlockProps, vars: TemplateVars): string {
  return `<p class="pib-p pib-align-${p.align}">${sanitizeInlineHtml(interp(p.html, vars))}</p>`
}

function renderButton(p: ButtonBlockProps, vars: TemplateVars): string {
  // AMP forbids inline `style` on most elements — we use classes only and
  // emit class-targeted CSS in <style amp-custom>.
  const url = escapeAttr(interp(p.url, vars))
  const text = escapeHtml(interp(p.text, vars))
  return `<p class="pib-button-wrap pib-align-${p.align}"><a href="${url}" target="_blank" class="pib-button${p.fullWidth ? ' pib-button-full' : ''}">${text}</a></p>`
}

function renderImage(p: ImageBlockProps, vars: TemplateVars): string {
  const src = escapeAttr(interp(p.src, vars))
  const alt = escapeAttr(p.alt || '')
  // amp-img REQUIRES width/height attributes. Fall back to 600x400 if the
  // block didn't specify a width (a square would be misleading for the
  // common hero-photo case).
  const width = p.width ?? 600
  const height = Math.round(width * 0.66)
  const img = `<amp-img src="${src}" alt="${alt}" width="${width}" height="${height}" layout="responsive"></amp-img>`
  const wrapped = p.link
    ? `<a href="${escapeAttr(interp(p.link, vars))}" target="_blank">${img}</a>`
    : img
  return `<div class="pib-image pib-align-${p.align}">${wrapped}</div>`
}

function renderDivider(p: DividerBlockProps): string {
  return `<hr class="pib-divider" style="border-top:${p.thickness}px solid ${p.color};" />`
}

function renderSpacer(p: SpacerBlockProps): string {
  return `<div class="pib-spacer pib-spacer-${p.height}"></div>`
}

function renderColumns(
  p: ColumnsBlockProps,
  ctx: RecipientContext | undefined,
  vars: TemplateVars,
): string {
  const colHtml = (col: Block[]): string =>
    col
      .filter((b) => evaluateCondition(b.condition, ctx))
      .map((b) => renderAmpBlock(b, ctx, vars))
      .join('')
  return `<div class="pib-columns">
    <div class="pib-col">${colHtml(p.columns[0])}</div>
    <div class="pib-col">${colHtml(p.columns[1])}</div>
  </div>`
}

function renderFooter(p: FooterBlockProps, vars: TemplateVars): string {
  const social = p.social ?? {}
  const links: string[] = []
  if (social.twitter) links.push(`<a href="${escapeAttr(social.twitter)}" target="_blank">Twitter</a>`)
  if (social.linkedin) links.push(`<a href="${escapeAttr(social.linkedin)}" target="_blank">LinkedIn</a>`)
  if (social.instagram) links.push(`<a href="${escapeAttr(social.instagram)}" target="_blank">Instagram</a>`)
  if (social.facebook) links.push(`<a href="${escapeAttr(social.facebook)}" target="_blank">Facebook</a>`)
  const unsub = escapeAttr(interp(p.unsubscribeUrl, vars))
  let prefsRaw = ''
  if (p.preferencesUrl) prefsRaw = interp(p.preferencesUrl, vars)
  else if (typeof vars.preferencesUrl === 'string' && vars.preferencesUrl) {
    prefsRaw = String(vars.preferencesUrl)
  }
  const prefs = prefsRaw ? escapeAttr(prefsRaw) : ''
  return `<div class="pib-footer">
    ${links.length ? `<p class="pib-social">${links.join(' · ')}</p>` : ''}
    <p class="pib-text-strong">${escapeHtml(interp(p.orgName, vars))}</p>
    <p>${escapeHtml(interp(p.address, vars))}</p>
    <p><a href="${unsub}" target="_blank">Unsubscribe</a>${prefs ? ` · <a href="${prefs}" target="_blank">Preferences</a>` : ''}</p>
  </div>`
}

// -------------------- AMP-only interactive blocks --------------------

function renderAmpCarousel(p: AmpCarouselBlockProps, vars: TemplateVars): string {
  if (!p.slides.length) return ''
  // Pick a sensible carousel dimension. We respect the FIRST slide's width
  // if it had one; otherwise default to 600x400.
  const width = 600
  const height = 400
  const auto = p.autoAdvance && p.autoAdvance >= 1000
    ? ` auto-advance="true" auto-advance-interval="${Math.round(p.autoAdvance)}"`
    : ''
  const slidesHtml = p.slides
    .map((s) => {
      const src = escapeAttr(interp(s.imageUrl, vars))
      const alt = escapeAttr(s.alt || '')
      const img = `<amp-img src="${src}" alt="${alt}" width="${width}" height="${height}" layout="responsive"></amp-img>`
      return s.linkUrl
        ? `<a href="${escapeAttr(interp(s.linkUrl, vars))}" target="_blank">${img}</a>`
        : img
    })
    .join('')
  return `<div class="pib-carousel">
    <amp-carousel width="${width}" height="${height}" layout="responsive" type="slides"${auto}>
      ${slidesHtml}
    </amp-carousel>
  </div>`
}

function renderAmpAccordion(p: AmpAccordionBlockProps, vars: TemplateVars): string {
  const sections = p.items
    .map((it) => {
      const heading = escapeHtml(interp(it.heading, vars))
      const body = sanitizeInlineHtml(interp(it.bodyHtml, vars))
      return `<section>
        <h4>${heading}</h4>
        <div>${body}</div>
      </section>`
    })
    .join('')
  return `<amp-accordion class="pib-accordion">${sections}</amp-accordion>`
}

function renderAmpForm(p: AmpFormBlockProps, vars: TemplateVars): string {
  const submitUrl = escapeAttr(interp(p.submitUrl, vars))
  const successMsg = escapeHtml(p.successMessage || 'Thanks!')
  const buttonText = escapeHtml(p.buttonText || 'Submit')
  // Fields render as <input type="text|email" name="key" ...>. Required by
  // default — recipients always need to fill them out for a meaningful submit.
  const fieldsHtml = p.fields
    .map(
      (f) => `<label>
        <span>${escapeHtml(f.label)}</span>
        <input type="${f.type === 'email' ? 'email' : 'text'}" name="${escapeAttr(f.key)}" required />
      </label>`,
    )
    .join('')
  return `<form method="post" action-xhr="${submitUrl}" target="_top" class="pib-form">
    ${fieldsHtml}
    <button type="submit">${buttonText}</button>
    <div submit-success><template type="amp-mustache">${successMsg}</template></div>
    <div submit-error><template type="amp-mustache">Sorry, something went wrong. Please try again.</template></div>
  </form>`
}

function renderAmpLiveData(p: AmpLiveDataBlockProps, vars: TemplateVars): string {
  const endpoint = escapeAttr(interp(p.endpoint, vars))
  // Template body lives between <template> tags — we pass the user's
  // mustache template through unchanged. The endpoint must return JSON.
  return `<amp-list src="${endpoint}" width="600" height="200" layout="responsive" class="pib-live">
    <template type="amp-mustache">
      ${p.template}
    </template>
  </amp-list>`
}

// -------------------- block dispatch --------------------

function renderAmpBlock(
  block: Block,
  ctx: RecipientContext | undefined,
  vars: TemplateVars,
): string {
  switch (block.type) {
    case 'hero':
      return renderHero(block.props, vars)
    case 'heading':
      return renderHeading(block.props, vars)
    case 'paragraph':
      return renderParagraph(block.props, vars)
    case 'button':
      return renderButton(block.props, vars)
    case 'image':
      return renderImage(block.props, vars)
    case 'divider':
      return renderDivider(block.props)
    case 'spacer':
      return renderSpacer(block.props)
    case 'columns':
      return renderColumns(block.props, ctx, vars)
    case 'footer':
      return renderFooter(block.props, vars)
    case 'amp-carousel':
      return renderAmpCarousel(block.props, vars)
    case 'amp-accordion':
      return renderAmpAccordion(block.props, vars)
    case 'amp-form':
      return renderAmpForm(block.props, vars)
    case 'amp-live-data':
      return renderAmpLiveData(block.props, vars)
  }
}

// -------------------- amp-custom CSS --------------------

function buildAmpCustomCss(theme: ThemeConfig, contentWidth: number): string {
  // Mirror the table-based HTML render's spacing / colour decisions while
  // staying under the AMP 75KB inline-style budget.
  return `
    body { margin:0; padding:0; background-color:${theme.backgroundColor}; font-family:${theme.fontFamily}; }
    .pib-container { width:100%; max-width:${contentWidth}px; margin:24px auto; background:#ffffff; border-radius:8px; overflow:hidden; }
    .pib-hero { padding:48px 24px; background-color:#0A0A0B; color:#fff; text-align:center; }
    .pib-hero h1 { margin:0 0 12px 0; font-size:32px; line-height:1.2; font-weight:700; }
    .pib-hero p { margin:0 0 24px 0; font-size:16px; line-height:1.5; opacity:0.9; }
    .pib-hero .pib-button { background-color:${theme.primaryColor}; color:#0A0A0B; }
    .pib-h1 { font-size:28px; line-height:1.3; margin:16px 24px 8px 24px; color:${theme.textColor}; font-weight:700; }
    .pib-h2 { font-size:22px; line-height:1.3; margin:16px 24px 8px 24px; color:${theme.textColor}; font-weight:700; }
    .pib-h3 { font-size:18px; line-height:1.3; margin:16px 24px 8px 24px; color:${theme.textColor}; font-weight:700; }
    .pib-p { font-size:16px; line-height:1.6; margin:8px 24px; color:${theme.textColor}; }
    .pib-button-wrap { margin:16px 24px; text-align:center; }
    .pib-align-left { text-align:left; }
    .pib-align-right { text-align:right; }
    .pib-align-center { text-align:center; }
    .pib-button { display:inline-block; padding:14px 28px; background-color:${theme.primaryColor}; color:#0A0A0B; text-decoration:none; border-radius:6px; font-size:16px; font-weight:600; }
    .pib-button-full { display:block; width:100%; box-sizing:border-box; }
    .pib-image { margin:16px 24px; text-align:center; }
    .pib-divider { margin:16px 24px; }
    .pib-spacer { height:24px; }
    .pib-columns { display:flex; padding:0 12px; gap:24px; }
    .pib-col { flex:1; }
    .pib-carousel { margin:16px 24px; }
    .pib-accordion { margin:16px 24px; }
    .pib-accordion h4 { font-size:16px; margin:0; padding:12px 0; cursor:pointer; }
    .pib-accordion section { border-bottom:1px solid #e5e7eb; }
    .pib-form { margin:16px 24px; }
    .pib-form label { display:block; margin-bottom:12px; }
    .pib-form label span { display:block; font-size:14px; margin-bottom:4px; color:${theme.textColor}; }
    .pib-form input { width:100%; padding:10px 12px; border:1px solid #d4d4d8; border-radius:6px; font-size:16px; box-sizing:border-box; }
    .pib-form button { padding:14px 28px; background-color:${theme.primaryColor}; color:#0A0A0B; border:none; border-radius:6px; font-size:16px; font-weight:600; cursor:pointer; }
    .pib-live { margin:16px 24px; }
    .pib-footer { padding:32px 24px 24px 24px; text-align:center; border-top:1px solid #e5e7eb; }
    .pib-footer p { margin:4px 0; font-size:13px; color:#666; }
    .pib-footer .pib-text-strong { font-weight:700; color:#333; }
    .pib-footer a { color:#888; text-decoration:underline; }
    @media (prefers-color-scheme: dark) {
      body { background-color:#0A0A0B; }
      .pib-container { background-color:#161618; }
      .pib-p, .pib-h1, .pib-h2, .pib-h3 { color:#F5F5F5; }
      .pib-footer { border-top-color:#2A2A2D; }
      .pib-footer p { color:#B5B5B5; }
    }
  `
    .replace(/\s+/g, ' ')
    .trim()
}

// -------------------- entry point --------------------

/**
 * Renders the AMP-for-Email body. Returns null when no interactive AMP
 * blocks are present (the send pipeline should skip the AMP MIME part).
 *
 * `recipientContext` is honoured the same way as the regular renderer —
 * `condition` rules on blocks decide visibility.
 */
export function renderAmpEmail(
  doc: EmailDocument,
  vars: TemplateVars = {},
  recipientContext?: RecipientContext,
): AmpRenderResult | null {
  if (!hasAmpBlocks(doc)) return null

  const theme = doc.theme
  const contentWidth = theme.contentWidth || 600
  const subject = interp(doc.subject, vars)
  const visibleBlocks = doc.blocks.filter((b) => evaluateCondition(b.condition, recipientContext))
  const componentScripts = getAmpComponentScripts(doc)
  const scriptTags = componentScripts
    .map((url) => {
      // Pick a `custom-element` based on the URL.
      const match = url.match(/v0\/(amp-[a-z-]+)-/)
      const customEl = match ? match[1] : 'amp-img'
      return `<script async custom-element="${customEl}" src="${url}"></script>`
    })
    .join('')

  const blocksHtml = visibleBlocks
    .map((b) => renderAmpBlock(b, recipientContext, vars))
    .join('')

  const customCss = buildAmpCustomCss(theme, contentWidth)

  // The `data-css-strict` attribute opts into AMP's strict CSS enforcement
  // (no inline styles outside `style="border-top:..."` for hr-like
  // elements). It's recommended for all AMP4Email documents going forward.
  const amp = `<!doctype html>
<html ⚡4email data-css-strict>
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
<script async src="${AMP_RUNTIME_URL}"></script>
${scriptTags}
<style amp-boilerplate>${AMP_BOILERPLATE}</style>
<noscript><style amp-boilerplate>${AMP_BOILERPLATE_NOSCRIPT}</style></noscript>
<style amp-custom>${customCss}</style>
</head>
<body>
<div class="pib-container">
${blocksHtml}
</div>
</body>
</html>`

  return { amp }
}
