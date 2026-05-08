// AI Gateway: plain "provider/model" strings route automatically through the gateway.
// Auth: run `vercel link` + `vercel env pull` to provision VERCEL_OIDC_TOKEN locally.
// On Vercel deployments OIDC tokens are auto-refreshed — no manual key management.
export const BRIEF_MODEL = 'anthropic/claude-haiku-4.5'
export const DRAFT_MODEL = 'anthropic/claude-sonnet-4.6'
