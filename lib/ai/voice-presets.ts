/**
 * Brand voice presets for the AI email generators.
 *
 * Each preset is a fully-formed BrandVoice you can pass straight to the
 * generators. `voiceFromOrg(orgId)` reads
 * `organizations/{orgId}.settings.brandVoice` and falls back to the PiB
 * founder voice when none is configured.
 */
import { adminDb } from '@/lib/firebase/admin'
import type { BrandVoice } from './email-generators'

// Peet's voice. Pulled from real PiB blog/marketing-site copy.
export const PIB_FOUNDER_VOICE: BrandVoice = {
  tone: 'founder-led',
  audience: 'small SA business owners and operators who want fewer tools, not more',
  doNotUseWords: [
    'leverage',
    'supercharge',
    'synergy',
    'unlock',
    'delve',
    'seamless',
    'revolutionise',
    'revolutionize',
    'game-changer',
    'cutting-edge',
    'next-level',
  ],
  sampleLines: [
    "Most agencies juggle five tools to do this. We don't think that's necessary.",
    'You should not need a developer to schedule a tweet.',
    "We built Partners in Biz because the existing tools assumed you were running a US-based SaaS, not a Cape Town café.",
    "If something on the platform takes more than three clicks, it's a bug. Tell us.",
  ],
  signOff: '— Peet',
  ctaStyle: 'direct',
}

export const WARM_PROFESSIONAL: BrandVoice = {
  tone: 'professional',
  audience: 'clients of a service business — accountants, consultants, agencies',
  doNotUseWords: [
    'leverage',
    'synergy',
    'supercharge',
    'cutting-edge',
    'in today\'s fast-paced world',
  ],
  sampleLines: [
    'Thanks for the kind note — happy to take that off your plate.',
    'Quick update on where we are with this, and what happens next.',
    "Let me know if Wednesday morning still works on your side.",
  ],
  signOff: 'Kind regards',
  ctaStyle: 'soft',
}

export const BOLD_STARTUP: BrandVoice = {
  tone: 'bold',
  audience: 'founders and operators who get a hundred pitch emails a week',
  doNotUseWords: [
    'leverage',
    'supercharge',
    'unlock',
    'delve',
    'best-in-class',
    'world-class',
  ],
  sampleLines: [
    "Here's the punchline first: we 3x'd qualified meetings for 14 of our last 20 customers in under 60 days.",
    "Not interested in a 'quick call'? Read the case study at the link. Two minutes.",
    'We are wrong about ~30% of the things we tried last quarter. Here is what worked.',
  ],
  signOff: '',
  ctaStyle: 'direct',
}

export const CLINICAL_AUTHORITY: BrandVoice = {
  tone: 'authoritative',
  audience: 'patients, clients, or counterparties of a law, health, or finance practice',
  doNotUseWords: ['supercharge', 'unlock', 'synergy', 'game-changer', 'cutting-edge'],
  sampleLines: [
    'Below is a brief summary of the latest position and the action required from you.',
    'For your records, we have attached the signed agreement and the relevant case reference.',
    'If anything in this note is unclear, please reply directly and we will respond within one business day.',
  ],
  signOff: 'Sincerely',
  ctaStyle: 'soft',
}

export const PLAYFUL_BRAND: BrandVoice = {
  tone: 'playful',
  audience: 'consumers shopping for clothing, food, beauty, or lifestyle products',
  doNotUseWords: ['leverage', 'synergy', 'supercharge', 'best-in-class'],
  sampleLines: [
    "Heads up — new drops just landed and they're already moving fast.",
    'Real talk: this is the one our team keeps stealing from each other.',
    "We don't do sales often. This is one of those weeks.",
  ],
  signOff: 'x',
  ctaStyle: 'direct',
}

export const VOICE_PRESETS = {
  PIB_FOUNDER_VOICE,
  WARM_PROFESSIONAL,
  BOLD_STARTUP,
  CLINICAL_AUTHORITY,
  PLAYFUL_BRAND,
} as const

export type VoicePresetName = keyof typeof VOICE_PRESETS

/**
 * Read the brand voice for an org from Firestore.
 * Path: `organizations/{orgId}.settings.brandVoice`.
 * Falls back to PIB_FOUNDER_VOICE when the doc or field is missing.
 */
export async function voiceFromOrg(orgId: string): Promise<BrandVoice> {
  try {
    const snap = await adminDb.collection('organizations').doc(orgId).get()
    if (!snap.exists) return PIB_FOUNDER_VOICE
    const data = snap.data() ?? {}
    const settings = (data.settings ?? {}) as Record<string, unknown>
    const v = settings.brandVoice
    if (!v || typeof v !== 'object') return PIB_FOUNDER_VOICE
    const obj = v as Record<string, unknown>

    const tone =
      typeof obj.tone === 'string' &&
      ['professional', 'friendly', 'bold', 'playful', 'authoritative', 'founder-led'].includes(
        obj.tone,
      )
        ? (obj.tone as BrandVoice['tone'])
        : PIB_FOUNDER_VOICE.tone

    const audience =
      typeof obj.audience === 'string' && obj.audience.trim().length > 0
        ? obj.audience.trim()
        : PIB_FOUNDER_VOICE.audience

    const doNotUseWords = Array.isArray(obj.doNotUseWords)
      ? (obj.doNotUseWords as unknown[]).filter((s): s is string => typeof s === 'string')
      : PIB_FOUNDER_VOICE.doNotUseWords

    const sampleLines = Array.isArray(obj.sampleLines)
      ? (obj.sampleLines as unknown[]).filter((s): s is string => typeof s === 'string')
      : PIB_FOUNDER_VOICE.sampleLines

    const signOff = typeof obj.signOff === 'string' ? obj.signOff : PIB_FOUNDER_VOICE.signOff
    const ctaStyle =
      obj.ctaStyle === 'soft' || obj.ctaStyle === 'direct'
        ? (obj.ctaStyle as BrandVoice['ctaStyle'])
        : PIB_FOUNDER_VOICE.ctaStyle

    return { tone, audience, doNotUseWords, sampleLines, signOff, ctaStyle }
  } catch {
    return PIB_FOUNDER_VOICE
  }
}
