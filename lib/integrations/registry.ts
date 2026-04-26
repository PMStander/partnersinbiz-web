// lib/integrations/registry.ts
//
// Central provider → adapter map. Adapter modules register themselves by
// importing this file (the registry imports them, not the other way around)
// so that a missing adapter is a build-time error and dispatch code can
// loop over `getAdapter()` for any provider it sees on a connection.

import type { IntegrationAdapter, IntegrationProvider } from './types'

const REGISTRY = new Map<IntegrationProvider, IntegrationAdapter>()

export function registerAdapter(adapter: IntegrationAdapter): void {
  if (REGISTRY.has(adapter.provider)) {
    // Last write wins — supports hot-reload in dev.
  }
  REGISTRY.set(adapter.provider, adapter)
}

export function getAdapter(provider: IntegrationProvider): IntegrationAdapter | null {
  return REGISTRY.get(provider) ?? null
}

export function getAdapterOrThrow(provider: IntegrationProvider): IntegrationAdapter {
  const adapter = REGISTRY.get(provider)
  if (!adapter) {
    throw new Error(`No integration adapter registered for provider: ${provider}`)
  }
  return adapter
}

export function listAdapters(): IntegrationAdapter[] {
  return Array.from(REGISTRY.values())
}

/* Adapter registration lives in `bootstrap.ts` to avoid a circular import:
 * adapters call `registerAdapter` from this file at module load, so this file
 * cannot itself import the adapter modules — that would put `REGISTRY` in TDZ
 * when the adapter side-effect runs. Anything that needs the registry
 * populated should `import '@/lib/integrations/bootstrap'` instead. */
