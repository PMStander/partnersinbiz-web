// lib/email-builder/render.ts
//
// Renders an EmailDocument to email-client-safe HTML and a plain-text
// alternative. Uses table-based layout with inline styles — required for
// reliable rendering in Outlook, Gmail, Yahoo, and Apple Mail.
//
// Conventions:
//   - Every block is wrapped in a single <tr><td>...</td></tr> inside the
//     main container table.
//   - Buttons get an MSO conditional block (<v:roundrect>) for Outlook.
//   - Only <style> tag in the document is a media query for mobile rules;
//     everything else is inline.
//   - Variable interpolation runs through `interpolate` from lib/email/template.ts.

import { interpolate, type TemplateVars } from '@/lib/email/template'
import type {
  AmpAccordionBlockProps,
  AmpCarouselBlockProps,
  AmpFormBlockProps,
  AmpLiveDataBlockProps,
  Block,
  BlockCondition,
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

export interface RenderResult {
  html: string
  text: string
}

// Recipient context used to evaluate per-block `condition` rules. When
// undefined (live preview, no contact data), every block renders.
export interface RecipientContext {
  tags?: string[]
  stage?: string
  customFields?: Record<string, string>
}

/**
 * Evaluate a block's visibility condition.
 *
 * Returns `true` (render) when:
 *   - no condition supplied, OR
 *   - no recipient context supplied (preview-safe default), OR
 *   - the condition matches the recipient.
 */
export function evaluateCondition(
  condition: BlockCondition | undefined,
  ctx: RecipientContext | undefined,
): boolean {
  if (!condition || condition.kind === 'always') return true
  // Without a recipient context (e.g. live preview), render every block —
  // hiding things in the editor would just confuse the user.
  if (!ctx) return true

  const tags = ctx.tags ?? []
  const stage = ctx.stage ?? ''
  const fields = ctx.customFields ?? {}

  switch (condition.kind) {
    case 'has-tag':
      return !!condition.tag && tags.includes(condition.tag)
    case 'not-has-tag':
      return !condition.tag || !tags.includes(condition.tag)
    case 'at-stage':
      return !!condition.stage && stage === condition.stage
    case 'not-at-stage':
      return !condition.stage || stage !== condition.stage
    case 'has-field': {
      if (!condition.field) return true
      const v = fields[condition.field]
      return typeof v === 'string' && v.length > 0
    }
    case 'field-equals': {
      if (!condition.field) return true
      return fields[condition.field] === (condition.value ?? '')
    }
    case 'field-not-empty': {
      if (!condition.field) return true
      const v = fields[condition.field]
      return typeof v === 'string' && v.trim().length > 0
    }
    default:
      return true
  }
}

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

// Strips all tags except a tiny allowlist for paragraph content.
// Inline-only tags so layout cannot be corrupted: b, strong, i, em, u, a, br, span.
function sanitizeInlineHtml(html: string): string {
  if (!html) return ''
  // Drop disallowed tags entirely (keep their text content)
  const ALLOWED = /^(b|strong|i|em|u|a|br|span)$/i
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag: string, rest: string) => {
    if (!ALLOWED.test(tag)) return ''
    // For <a> keep href/title/target/rel only
    if (tag.toLowerCase() === 'a' && match.startsWith('<a')) {
      const hrefMatch = rest.match(/href=("[^"]*"|'[^']*')/i)
      const titleMatch = rest.match(/title=("[^"]*"|'[^']*')/i)
      const safe = [hrefMatch?.[0], titleMatch?.[0], 'target="_blank"', 'rel="noopener noreferrer"']
        .filter(Boolean)
        .join(' ')
      return `<a ${safe}>`
    }
    return match.replace(/\son\w+=("[^"]*"|'[^']*')/gi, '')
  })
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

function interp(s: string | undefined, vars: TemplateVars): string {
  return interpolate(s ?? '', vars)
}

// -------------------- block renderers --------------------

function renderHero(p: HeroBlockProps, theme: ThemeConfig, vars: TemplateVars): string {
  // Hero ignores dark-mode background override on purpose — most hero
  // sections are designed with the colour as part of the brand identity.
  const bg = p.backgroundUrl
    ? `background-color:${p.backgroundColor};background-image:url('${escapeAttr(interp(p.backgroundUrl, vars))}');background-size:cover;background-position:center;`
    : `background-color:${p.backgroundColor};`
  const textColor = p.textColor || '#ffffff'
  const ctaColor = p.ctaColor || theme.primaryColor
  const headline = escapeHtml(interp(p.headline, vars))
  const subhead = p.subhead ? escapeHtml(interp(p.subhead, vars)) : ''

  let cta = ''
  if (p.ctaText && p.ctaUrl) {
    cta = renderButtonInner({
      text: p.ctaText,
      url: p.ctaUrl,
      color: ctaColor,
      textColor: textColor === '#ffffff' ? '#0A0A0B' : '#ffffff',
      align: 'center',
      fullWidth: false,
    }, vars)
  }

  return `<tr><td align="center" class="pib-hero" style="${bg}padding:48px 24px;text-align:center;">
    <h1 style="margin:0 0 12px 0;font-size:32px;line-height:1.2;color:${textColor};font-weight:700;font-family:${theme.fontFamily};">${headline}</h1>
    ${subhead ? `<p style="margin:0 0 24px 0;font-size:16px;line-height:1.5;color:${textColor};opacity:0.9;font-family:${theme.fontFamily};">${subhead}</p>` : ''}
    ${cta}
  </td></tr>`
}

function renderHeading(p: HeadingBlockProps, theme: ThemeConfig, vars: TemplateVars): string {
  const sizes: Record<1 | 2 | 3, string> = { 1: '28px', 2: '22px', 3: '18px' }
  const tag = `h${p.level}`
  return `<tr><td class="pib-card" style="padding:16px 24px 8px 24px;text-align:${p.align};">
    <${tag} class="pib-text" style="margin:0;font-size:${sizes[p.level]};line-height:1.3;color:${theme.textColor};font-weight:700;font-family:${theme.fontFamily};">${escapeHtml(interp(p.text, vars))}</${tag}>
  </td></tr>`
}

function renderParagraph(p: ParagraphBlockProps, theme: ThemeConfig, vars: TemplateVars): string {
  const html = sanitizeInlineHtml(interp(p.html, vars))
  return `<tr><td class="pib-card" style="padding:8px 24px;text-align:${p.align};">
    <p class="pib-text" style="margin:0;font-size:16px;line-height:1.6;color:${theme.textColor};font-family:${theme.fontFamily};">${html}</p>
  </td></tr>`
}

function renderButtonInner(p: ButtonBlockProps, vars: TemplateVars): string {
  const url = escapeAttr(interp(p.url, vars))
  const text = escapeHtml(interp(p.text, vars))
  const width = p.fullWidth ? 'width:100%;' : ''
  const mso = `<!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="12%" stroke="f" fillcolor="${p.color}">
    <w:anchorlock/>
    <center style="color:${p.textColor};font-family:sans-serif;font-size:16px;font-weight:bold;">${text}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-- -->`
  const msoEnd = `<!--<![endif]-->`
  return `${mso}<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;${width}padding:14px 28px;background-color:${p.color};color:${p.textColor};text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;line-height:1;mso-hide:all;">${text}</a>${msoEnd}`
}

function renderButton(p: ButtonBlockProps, _theme: ThemeConfig, vars: TemplateVars): string {
  return `<tr><td align="${p.align}" class="pib-card" style="padding:16px 24px;text-align:${p.align};">
    ${renderButtonInner(p, vars)}
  </td></tr>`
}

function renderImage(p: ImageBlockProps, _theme: ThemeConfig, vars: TemplateVars): string {
  const src = escapeAttr(interp(p.src, vars))
  const alt = escapeAttr(p.alt || '')
  const widthAttr = p.width ? `width="${p.width}"` : ''
  const widthStyle = p.width ? `max-width:${p.width}px;width:100%;` : 'max-width:100%;'
  const img = `<img src="${src}" alt="${alt}" ${widthAttr} class="pib-img" style="display:block;border:0;outline:none;text-decoration:none;${widthStyle}height:auto;" />`
  const wrapped = p.link ? `<a href="${escapeAttr(interp(p.link, vars))}" target="_blank" rel="noopener noreferrer">${img}</a>` : img
  return `<tr><td align="${p.align}" class="pib-card" style="padding:16px 24px;text-align:${p.align};">${wrapped}</td></tr>`
}

function renderDivider(p: DividerBlockProps): string {
  return `<tr><td class="pib-card" style="padding:16px 24px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td class="pib-divider" style="border-top:${p.thickness}px solid ${p.color};line-height:0;font-size:0;">&nbsp;</td></tr></table>
  </td></tr>`
}

function renderSpacer(p: SpacerBlockProps): string {
  return `<tr><td style="height:${p.height}px;line-height:${p.height}px;font-size:0;">&nbsp;</td></tr>`
}

function renderColumns(
  p: ColumnsBlockProps,
  theme: ThemeConfig,
  vars: TemplateVars,
  ctx: RecipientContext | undefined,
): string {
  const [col1, col2] = p.columns
  const colHtml = (col: Block[]): string =>
    col
      .filter((b) => evaluateCondition(b.condition, ctx))
      .map((b) => renderBlock(b, theme, vars, ctx))
      .join('')
  // Mobile media query (in <style>) stacks columns; here we keep two-up.
  return `<tr><td style="padding:0 12px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
      <tr>
        <td class="pib-col" width="50%" valign="top" style="padding:0 12px;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${colHtml(col1)}</table>
        </td>
        <td class="pib-col" width="50%" valign="top" style="padding:0 12px;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${colHtml(col2)}</table>
        </td>
      </tr>
    </table>
  </td></tr>`
}

function renderFooter(p: FooterBlockProps, theme: ThemeConfig, vars: TemplateVars): string {
  const social = p.social ?? {}
  const socialLinks: string[] = []
  if (social.twitter) socialLinks.push(`<a href="${escapeAttr(social.twitter)}" class="pib-text-muted" style="color:#888;text-decoration:underline;margin:0 6px;">Twitter</a>`)
  if (social.linkedin) socialLinks.push(`<a href="${escapeAttr(social.linkedin)}" class="pib-text-muted" style="color:#888;text-decoration:underline;margin:0 6px;">LinkedIn</a>`)
  if (social.instagram) socialLinks.push(`<a href="${escapeAttr(social.instagram)}" class="pib-text-muted" style="color:#888;text-decoration:underline;margin:0 6px;">Instagram</a>`)
  if (social.facebook) socialLinks.push(`<a href="${escapeAttr(social.facebook)}" class="pib-text-muted" style="color:#888;text-decoration:underline;margin:0 6px;">Facebook</a>`)

  const unsub = escapeAttr(interp(p.unsubscribeUrl, vars))
  // Preferences URL precedence:
  //   1) Footer block's `preferencesUrl` prop (interpolated)
  //   2) `preferencesUrl` template var (set by send pipelines)
  //   3) Omit the preferences link entirely.
  let prefsRaw = ''
  if (p.preferencesUrl) {
    prefsRaw = interp(p.preferencesUrl, vars)
  } else if (typeof vars.preferencesUrl === 'string' && vars.preferencesUrl) {
    prefsRaw = String(vars.preferencesUrl)
  }
  const prefs = prefsRaw ? escapeAttr(prefsRaw) : ''

  return `<tr><td class="pib-footer pib-card" style="padding:32px 24px 24px 24px;text-align:center;border-top:1px solid #e5e7eb;">
    ${socialLinks.length ? `<div style="margin-bottom:12px;">${socialLinks.join('')}</div>` : ''}
    <p class="pib-text-muted" style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#666;font-family:${theme.fontFamily};">
      <strong class="pib-text" style="color:#333;">${escapeHtml(interp(p.orgName, vars))}</strong><br/>
      ${escapeHtml(interp(p.address, vars))}
    </p>
    <p class="pib-text-muted" style="margin:0;font-size:12px;line-height:1.5;color:#888;font-family:${theme.fontFamily};">
      <a href="${unsub}" class="pib-text-muted" style="color:#888;text-decoration:underline;">Unsubscribe</a>
      ${prefs ? ` &middot; <a href="${prefs}" class="pib-text-muted" style="color:#888;text-decoration:underline;">Preferences</a>` : ''}
    </p>
  </td></tr>`
}

// -------------------- AMP block HTML fallbacks --------------------
//
// These render the non-AMP fallback HTML for the 4 interactive block types.
// Recipients on AMP-capable clients get the AMP MIME part rendered by
// lib/email-builder/render-amp.ts; everyone else falls back to these.

function renderAmpCarouselFallback(
  p: AmpCarouselBlockProps,
  theme: ThemeConfig,
  vars: TemplateVars,
): string {
  // Fallback shows the first slide as a regular linked image so we don't
  // bury the content the carousel was advertising.
  if (!p.slides.length) return ''
  const slide = p.slides[0]
  const src = escapeAttr(interp(slide.imageUrl, vars))
  const alt = escapeAttr(slide.alt || '')
  const img = `<img src="${src}" alt="${alt}" class="pib-img" style="display:block;border:0;outline:none;text-decoration:none;max-width:100%;height:auto;" />`
  const wrapped = slide.linkUrl
    ? `<a href="${escapeAttr(interp(slide.linkUrl, vars))}" target="_blank" rel="noopener noreferrer">${img}</a>`
    : img
  return `<tr><td align="center" class="pib-card" style="padding:16px 24px;text-align:center;">
    ${wrapped}
    ${p.slides.length > 1 ? `<p class="pib-text-muted" style="margin:8px 0 0 0;font-size:12px;color:#888;font-family:${theme.fontFamily};">+${p.slides.length - 1} more in supported clients</p>` : ''}
  </td></tr>`
}

function renderAmpAccordionFallback(
  p: AmpAccordionBlockProps,
  theme: ThemeConfig,
  vars: TemplateVars,
): string {
  // No native HTML <details> in many email clients — render every item
  // expanded so the recipient still gets the content.
  const itemsHtml = p.items
    .map((item) => {
      const heading = escapeHtml(interp(item.heading, vars))
      const body = sanitizeInlineHtml(interp(item.bodyHtml, vars))
      return `<div style="margin-bottom:16px;">
        <h3 class="pib-text" style="margin:0 0 6px 0;font-size:18px;line-height:1.3;color:${theme.textColor};font-weight:700;font-family:${theme.fontFamily};">${heading}</h3>
        <div class="pib-text" style="font-size:14px;line-height:1.6;color:${theme.textColor};font-family:${theme.fontFamily};">${body}</div>
      </div>`
    })
    .join('')
  return `<tr><td class="pib-card" style="padding:16px 24px;">${itemsHtml}</td></tr>`
}

function renderAmpFormFallback(
  p: AmpFormBlockProps,
  theme: ThemeConfig,
  vars: TemplateVars,
): string {
  // HTML email cannot reliably submit forms — render a button linking out to
  // the submitUrl so the recipient can complete the action in a browser.
  const submitUrl = escapeAttr(interp(p.submitUrl, vars))
  const buttonText = escapeHtml(p.buttonText || 'Submit')
  return `<tr><td align="center" class="pib-card" style="padding:16px 24px;text-align:center;">
    ${renderButtonInner(
      {
        text: buttonText,
        url: p.submitUrl,
        color: theme.primaryColor,
        textColor: '#0A0A0B',
        align: 'center',
        fullWidth: false,
      },
      vars,
    )}
    <p class="pib-text-muted" style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:#888;font-family:${theme.fontFamily};">
      Or open: <a href="${submitUrl}" class="pib-text-muted" style="color:#888;text-decoration:underline;">${submitUrl}</a>
    </p>
  </td></tr>`
}

function renderAmpLiveDataFallback(
  _p: AmpLiveDataBlockProps,
  theme: ThemeConfig,
): string {
  return `<tr><td class="pib-card" style="padding:16px 24px;">
    <p class="pib-text-muted" style="margin:0;font-size:14px;line-height:1.5;color:#888;font-style:italic;font-family:${theme.fontFamily};">
      Live data is available in supported email clients.
    </p>
  </td></tr>`
}

function renderBlock(
  block: Block,
  theme: ThemeConfig,
  vars: TemplateVars,
  ctx: RecipientContext | undefined,
): string {
  switch (block.type) {
    case 'hero':
      return renderHero(block.props, theme, vars)
    case 'heading':
      return renderHeading(block.props, theme, vars)
    case 'paragraph':
      return renderParagraph(block.props, theme, vars)
    case 'button':
      return renderButton(block.props, theme, vars)
    case 'image':
      return renderImage(block.props, theme, vars)
    case 'divider':
      return renderDivider(block.props)
    case 'spacer':
      return renderSpacer(block.props)
    case 'columns':
      return renderColumns(block.props, theme, vars, ctx)
    case 'footer':
      return renderFooter(block.props, theme, vars)
    case 'amp-carousel':
      return renderAmpCarouselFallback(block.props, theme, vars)
    case 'amp-accordion':
      return renderAmpAccordionFallback(block.props, theme, vars)
    case 'amp-form':
      return renderAmpFormFallback(block.props, theme, vars)
    case 'amp-live-data':
      return renderAmpLiveDataFallback(block.props, theme)
  }
}

// -------------------- plain text generation --------------------

function blockToText(block: Block, vars: TemplateVars, ctx: RecipientContext | undefined): string {
  switch (block.type) {
    case 'hero': {
      const lines = [interp(block.props.headline, vars)]
      if (block.props.subhead) lines.push(interp(block.props.subhead, vars))
      if (block.props.ctaText && block.props.ctaUrl) lines.push(`${interp(block.props.ctaText, vars)}: ${interp(block.props.ctaUrl, vars)}`)
      return lines.join('\n')
    }
    case 'heading':
      return `\n${interp(block.props.text, vars)}\n`
    case 'paragraph':
      return stripTags(interp(block.props.html, vars))
    case 'button':
      return `${interp(block.props.text, vars)}: ${interp(block.props.url, vars)}`
    case 'image':
      return `[${block.props.alt || 'image'}]`
    case 'divider':
      return '---'
    case 'spacer':
      return ''
    case 'columns':
      return [...block.props.columns[0], ...block.props.columns[1]]
        .filter((b) => evaluateCondition(b.condition, ctx))
        .map((b) => blockToText(b, vars, ctx))
        .join('\n')
    case 'footer':
      return `\n${interp(block.props.orgName, vars)}\n${interp(block.props.address, vars)}\nUnsubscribe: ${interp(block.props.unsubscribeUrl, vars)}`
    case 'amp-carousel': {
      // Just show the first slide alt + link in plain-text.
      const first = block.props.slides[0]
      if (!first) return ''
      const parts = [first.alt || '[image]']
      if (first.linkUrl) parts.push(interp(first.linkUrl, vars))
      return parts.join(': ')
    }
    case 'amp-accordion':
      return block.props.items
        .map(
          (it) =>
            `\n${interp(it.heading, vars)}\n${stripTags(interp(it.bodyHtml, vars))}`,
        )
        .join('\n')
    case 'amp-form':
      return `${block.props.buttonText}: ${interp(block.props.submitUrl, vars)}`
    case 'amp-live-data':
      return '[Live data — available in supported email clients]'
  }
}

// -------------------- entry point --------------------

export function renderEmail(
  doc: EmailDocument,
  vars: TemplateVars = {},
  recipientContext?: RecipientContext,
): RenderResult {
  const theme = doc.theme
  const contentWidth = theme.contentWidth || 600
  const subject = interp(doc.subject, vars)
  const preheader = interp(doc.preheader, vars)
  const visibleBlocks = doc.blocks.filter((b) => evaluateCondition(b.condition, recipientContext))
  const blocksHtml = visibleBlocks.map((b) => renderBlock(b, theme, vars, recipientContext)).join('')

  // Dark-mode CSS. When the theme requests `force-light` we skip emitting
  // the dark-mode rules entirely so the email renders identically in dark
  // and light modes. Otherwise emit:
  //   - color-scheme + supported-color-schemes meta tags (Apple Mail, iOS, Gmail iOS)
  //   - @media (prefers-color-scheme: dark) overrides
  //   - [data-ogsc] class-based fallback for Outlook 365 Windows which
  //     doesn't honour prefers-color-scheme but injects this attribute on
  //     the body when its dark mode is active.
  //
  // Class-based overrides target the per-block dark-mode classes emitted
  // above: .pib-card, .pib-text, .pib-text-muted, .pib-divider, .pib-img.
  const darkModeMode = theme.darkMode ?? 'auto'
  const includeDarkMode = darkModeMode !== 'force-light'
  const darkModeMeta = includeDarkMode
    ? `<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />`
    : ''
  const darkModeStyles = includeDarkMode
    ? `
  /* prefers-color-scheme dark-mode overrides (Apple Mail, iOS Mail, Gmail iOS, Outlook iOS/Android) */
  @media (prefers-color-scheme: dark) {
    body, table.pib-bg { background-color: #0A0A0B !important; }
    .pib-container, .pib-card { background-color: #161618 !important; }
    .pib-text, .pib-text p, .pib-text h1, .pib-text h2, .pib-text h3, .pib-text h4 { color: #F5F5F5 !important; }
    .pib-text-muted { color: #B5B5B5 !important; }
    .pib-footer { border-top-color: #2A2A2D !important; }
    .pib-divider { border-top-color: #2A2A2D !important; }
    a:not(.pib-button) { color: #F5A623 !important; }
  }
  /* Outlook 365 (Windows) dark mode — does not honour prefers-color-scheme but
     injects [data-ogsc] on the body. Mirror the same overrides. */
  [data-ogsc] body, [data-ogsc] table.pib-bg { background-color: #0A0A0B !important; }
  [data-ogsc] .pib-container, [data-ogsc] .pib-card { background-color: #161618 !important; }
  [data-ogsc] .pib-text, [data-ogsc] .pib-text p, [data-ogsc] .pib-text h1, [data-ogsc] .pib-text h2, [data-ogsc] .pib-text h3 { color: #F5F5F5 !important; }
  [data-ogsc] .pib-text-muted { color: #B5B5B5 !important; }
  [data-ogsc] .pib-footer { border-top-color: #2A2A2D !important; }
  [data-ogsc] .pib-divider { border-top-color: #2A2A2D !important; }
  [data-ogsc] a:not(.pib-button) { color: #F5A623 !important; }
`
    : ''

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
${darkModeMeta}
<title>${escapeHtml(subject)}</title>
<!--[if mso]>
<noscript>
  <xml>
    <o:OfficeDocumentSettings>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
</noscript>
<![endif]-->
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-line-height-rule:exactly; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
  a { color:inherit; }
  @media (max-width: ${contentWidth}px) {
    .pib-container { width:100% !important; max-width:100% !important; }
    .pib-col { display:block !important; width:100% !important; }
  }${darkModeStyles}
</style>
</head>
<body style="margin:0;padding:0;background-color:${theme.backgroundColor};font-family:${theme.fontFamily};">
<div style="display:none;font-size:1px;color:${theme.backgroundColor};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" class="pib-bg" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${theme.backgroundColor};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="pib-container" width="${contentWidth}" border="0" cellpadding="0" cellspacing="0" style="width:${contentWidth}px;max-width:${contentWidth}px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        ${blocksHtml}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  const text = visibleBlocks
    .map((b) => blockToText(b, vars, recipientContext))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { html, text }
}
