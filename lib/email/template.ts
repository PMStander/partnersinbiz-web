// Template variable interpolation for campaign / sequence emails.
//
// Replaces `{{varName}}` tokens (with optional whitespace inside the braces)
// with values from the supplied vars object. Unknown variables are left as
// the empty string — never crash a send because of a missing field.
//
// HTML escaping is intentionally NOT applied here. Variables come from
// trusted sources (CRM contact records, org settings, system-generated
// unsubscribe URLs); the email body itself is already raw HTML edited by
// the operator. If we later accept untrusted input we'll need to escape.

export interface TemplateVars {
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  company?: string
  orgName?: string
  unsubscribeUrl?: string
  // Allow arbitrary extras — campaigns may add custom fields per send.
  [key: string]: string | number | undefined
}

const TOKEN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export function interpolate(template: string, vars: TemplateVars): string {
  if (!template) return template
  return template.replace(TOKEN, (_match, key: string) => {
    const v = vars[key]
    if (v === undefined || v === null) return ''
    return String(v)
  })
}

// Lists every variable referenced in a template string. Used by the campaign
// editor to warn operators about missing data sources before launching.
export function extractVariables(template: string): string[] {
  if (!template) return []
  const found = new Set<string>()
  let m: RegExpExecArray | null
  const re = new RegExp(TOKEN.source, 'g')
  while ((m = re.exec(template)) !== null) {
    found.add(m[1])
  }
  return [...found]
}

// Convenience: builds a TemplateVars from a Contact record. Splits `name`
// into first/last when those fields aren't separately stored on the doc.
export function varsFromContact(contact: {
  name?: string
  email?: string
  company?: string
  firstName?: string
  lastName?: string
}): TemplateVars {
  const fullName = contact.name ?? ''
  const space = fullName.indexOf(' ')
  const firstName = contact.firstName ?? (space === -1 ? fullName : fullName.slice(0, space))
  const lastName = contact.lastName ?? (space === -1 ? '' : fullName.slice(space + 1))
  return {
    firstName,
    lastName,
    fullName,
    email: contact.email ?? '',
    company: contact.company ?? '',
  }
}
