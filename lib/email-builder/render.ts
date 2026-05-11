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

export interface RenderResult {
  html: string
  text: string
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

  return `<tr><td align="center" style="${bg}padding:48px 24px;text-align:center;">
    <h1 style="margin:0 0 12px 0;font-size:32px;line-height:1.2;color:${textColor};font-weight:700;font-family:${theme.fontFamily};">${headline}</h1>
    ${subhead ? `<p style="margin:0 0 24px 0;font-size:16px;line-height:1.5;color:${textColor};opacity:0.9;font-family:${theme.fontFamily};">${subhead}</p>` : ''}
    ${cta}
  </td></tr>`
}

function renderHeading(p: HeadingBlockProps, theme: ThemeConfig, vars: TemplateVars): string {
  const sizes: Record<1 | 2 | 3, string> = { 1: '28px', 2: '22px', 3: '18px' }
  const tag = `h${p.level}`
  return `<tr><td style="padding:16px 24px 8px 24px;text-align:${p.align};">
    <${tag} style="margin:0;font-size:${sizes[p.level]};line-height:1.3;color:${theme.textColor};font-weight:700;font-family:${theme.fontFamily};">${escapeHtml(interp(p.text, vars))}</${tag}>
  </td></tr>`
}

function renderParagraph(p: ParagraphBlockProps, theme: ThemeConfig, vars: TemplateVars): string {
  const html = sanitizeInlineHtml(interp(p.html, vars))
  return `<tr><td style="padding:8px 24px;text-align:${p.align};">
    <p style="margin:0;font-size:16px;line-height:1.6;color:${theme.textColor};font-family:${theme.fontFamily};">${html}</p>
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
  return `<tr><td align="${p.align}" style="padding:16px 24px;text-align:${p.align};">
    ${renderButtonInner(p, vars)}
  </td></tr>`
}

function renderImage(p: ImageBlockProps, _theme: ThemeConfig, vars: TemplateVars): string {
  const src = escapeAttr(interp(p.src, vars))
  const alt = escapeAttr(p.alt || '')
  const widthAttr = p.width ? `width="${p.width}"` : ''
  const widthStyle = p.width ? `max-width:${p.width}px;width:100%;` : 'max-width:100%;'
  const img = `<img src="${src}" alt="${alt}" ${widthAttr} style="display:block;border:0;outline:none;text-decoration:none;${widthStyle}height:auto;" />`
  const wrapped = p.link ? `<a href="${escapeAttr(interp(p.link, vars))}" target="_blank" rel="noopener noreferrer">${img}</a>` : img
  return `<tr><td align="${p.align}" style="padding:16px 24px;text-align:${p.align};">${wrapped}</td></tr>`
}

function renderDivider(p: DividerBlockProps): string {
  return `<tr><td style="padding:16px 24px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="border-top:${p.thickness}px solid ${p.color};line-height:0;font-size:0;">&nbsp;</td></tr></table>
  </td></tr>`
}

function renderSpacer(p: SpacerBlockProps): string {
  return `<tr><td style="height:${p.height}px;line-height:${p.height}px;font-size:0;">&nbsp;</td></tr>`
}

function renderColumns(p: ColumnsBlockProps, theme: ThemeConfig, vars: TemplateVars): string {
  const [col1, col2] = p.columns
  const colHtml = (col: Block[]): string =>
    col.map((b) => renderBlock(b, theme, vars)).join('')
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
  if (social.twitter) socialLinks.push(`<a href="${escapeAttr(social.twitter)}" style="color:#888;text-decoration:underline;margin:0 6px;">Twitter</a>`)
  if (social.linkedin) socialLinks.push(`<a href="${escapeAttr(social.linkedin)}" style="color:#888;text-decoration:underline;margin:0 6px;">LinkedIn</a>`)
  if (social.instagram) socialLinks.push(`<a href="${escapeAttr(social.instagram)}" style="color:#888;text-decoration:underline;margin:0 6px;">Instagram</a>`)
  if (social.facebook) socialLinks.push(`<a href="${escapeAttr(social.facebook)}" style="color:#888;text-decoration:underline;margin:0 6px;">Facebook</a>`)

  const unsub = escapeAttr(interp(p.unsubscribeUrl, vars))
  const prefs = p.preferencesUrl ? escapeAttr(interp(p.preferencesUrl, vars)) : ''

  return `<tr><td style="padding:32px 24px 24px 24px;text-align:center;border-top:1px solid #e5e7eb;">
    ${socialLinks.length ? `<div style="margin-bottom:12px;">${socialLinks.join('')}</div>` : ''}
    <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#666;font-family:${theme.fontFamily};">
      <strong style="color:#333;">${escapeHtml(interp(p.orgName, vars))}</strong><br/>
      ${escapeHtml(interp(p.address, vars))}
    </p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#888;font-family:${theme.fontFamily};">
      <a href="${unsub}" style="color:#888;text-decoration:underline;">Unsubscribe</a>
      ${prefs ? ` &middot; <a href="${prefs}" style="color:#888;text-decoration:underline;">Preferences</a>` : ''}
    </p>
  </td></tr>`
}

function renderBlock(block: Block, theme: ThemeConfig, vars: TemplateVars): string {
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
      return renderColumns(block.props, theme, vars)
    case 'footer':
      return renderFooter(block.props, theme, vars)
  }
}

// -------------------- plain text generation --------------------

function blockToText(block: Block, vars: TemplateVars): string {
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
      return [...block.props.columns[0], ...block.props.columns[1]].map((b) => blockToText(b, vars)).join('\n')
    case 'footer':
      return `\n${interp(block.props.orgName, vars)}\n${interp(block.props.address, vars)}\nUnsubscribe: ${interp(block.props.unsubscribeUrl, vars)}`
  }
}

// -------------------- entry point --------------------

export function renderEmail(doc: EmailDocument, vars: TemplateVars = {}): RenderResult {
  const theme = doc.theme
  const contentWidth = theme.contentWidth || 600
  const subject = interp(doc.subject, vars)
  const preheader = interp(doc.preheader, vars)
  const blocksHtml = doc.blocks.map((b) => renderBlock(b, theme, vars)).join('')

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
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
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${theme.backgroundColor};font-family:${theme.fontFamily};">
<div style="display:none;font-size:1px;color:${theme.backgroundColor};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${theme.backgroundColor};">
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

  const text = doc.blocks
    .map((b) => blockToText(b, vars))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { html, text }
}
