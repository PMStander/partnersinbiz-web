import {
  createPixelConfig,
  getPixelConfig,
  listPixelConfigs,
  updatePixelConfig,
  deletePixelConfig,
  setPlatformCapiToken,
  decryptPlatformCapiToken,
} from '@/lib/ads/pixel-configs/store'

// ─── Firestore mock with chainable where ──────────────────────────────────────

jest.mock('@/lib/firebase/admin', () => {
  const docs = new Map<string, Record<string, unknown>>()

  function makeQuery(path: string, filters: Array<[string, string, unknown]> = []) {
    return {
      where: (field: string, op: string, value: unknown) =>
        makeQuery(path, [...filters, [field, op, value]]),
      get: async () => ({
        docs: Array.from(docs.entries())
          .filter(([k]) => k.startsWith(`${path}/`))
          .filter(([, data]) =>
            filters.every(([field, op, value]) => {
              if (op !== '==') return true
              return (data as Record<string, unknown>)[field] === value
            }),
          )
          .map(([k, v]) => ({ id: k.replace(`${path}/`, ''), data: () => v })),
      }),
    }
  }

  const collection = (path: string) => ({
    doc: (id: string) => ({
      get: async () => ({
        exists: docs.has(`${path}/${id}`),
        id,
        data: () => docs.get(`${path}/${id}`),
      }),
      set: async (data: Record<string, unknown>) => {
        docs.set(`${path}/${id}`, { ...data })
      },
      update: async (patch: Record<string, unknown>) => {
        const cur = docs.get(`${path}/${id}`) ?? {}
        docs.set(`${path}/${id}`, { ...cur, ...patch })
      },
      delete: async () => {
        docs.delete(`${path}/${id}`)
      },
    }),
    where: (field: string, op: string, value: unknown) => makeQuery(path, [[field, op, value]]),
  })

  return {
    adminDb: { collection },
    _docs: docs,
  }
})

// ─── Encryption env var ───────────────────────────────────────────────────────

process.env.SOCIAL_TOKEN_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  name: 'My Pixel Config',
  eventMappings: [{ pibEventName: 'purchase', metaEventName: 'Purchase' }],
}

describe('pixel-configs store', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { _docs } = require('@/lib/firebase/admin') as { _docs: Map<string, unknown> }
    _docs.clear()
  })

  // ─── Test 1: roundtrip create/get with encryption verified ─────────────────
  it('roundtrips create/get; capiTokenEnc ciphertext does not contain plaintext token', async () => {
    const plaintext = 'EAAOsup3rs3cr3t_tok3n'
    const config = await createPixelConfig({
      orgId: 'org_1',
      createdBy: 'user_abc',
      input: {
        ...BASE_INPUT,
        meta: {
          pixelId: 'px_111',
          // capiToken is an escape hatch accepted by the store — not on the type,
          // but handled by encryptPlatformIfNeeded
          ...(({ capiToken: plaintext } as unknown) as Record<string, unknown>),
        } as Parameters<typeof createPixelConfig>[0]['input']['meta'],
      },
    })

    expect(config.id).toMatch(/^pxc_[0-9a-f]{16}$/)
    expect(config.orgId).toBe('org_1')
    expect(config.createdBy).toBe('user_abc')
    expect(config.meta?.pixelId).toBe('px_111')
    expect(config.meta?.capiTokenEnc).toBeDefined()

    // Ciphertext must NOT contain the plaintext token
    const encStr = JSON.stringify(config.meta?.capiTokenEnc)
    expect(encStr).not.toContain(plaintext)

    // Round-trip: get returns same doc
    const fetched = await getPixelConfig(config.id)
    expect(fetched?.id).toBe(config.id)
    expect(fetched?.name).toBe('My Pixel Config')

    // Decrypt should recover plaintext
    const decrypted = decryptPlatformCapiToken(fetched!, 'meta')
    expect(decrypted).toBe(plaintext)
  })

  // ─── Test 2: listPixelConfigs filters by orgId + propertyId ────────────────
  it('listPixelConfigs filters by orgId and optional propertyId', async () => {
    await createPixelConfig({
      orgId: 'org_1',
      createdBy: 'u1',
      input: { ...BASE_INPUT, propertyId: 'prop_A', name: 'Config A' },
    })
    await createPixelConfig({
      orgId: 'org_1',
      createdBy: 'u1',
      input: { ...BASE_INPUT, propertyId: 'prop_B', name: 'Config B' },
    })
    await createPixelConfig({
      orgId: 'org_2',
      createdBy: 'u2',
      input: { ...BASE_INPUT, propertyId: 'prop_A', name: 'Config C' },
    })

    // All from org_1
    const all = await listPixelConfigs({ orgId: 'org_1' })
    expect(all).toHaveLength(2)

    // Filtered by propertyId
    const filtered = await listPixelConfigs({ orgId: 'org_1', propertyId: 'prop_A' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Config A')

    // org_2 only has one
    const org2 = await listPixelConfigs({ orgId: 'org_2' })
    expect(org2).toHaveLength(1)
  })

  // ─── Test 3: updatePixelConfig patches updatedAt ──────────────────────────
  it('updatePixelConfig patches fields and bumps updatedAt', async () => {
    const config = await createPixelConfig({
      orgId: 'org_1',
      createdBy: 'u1',
      input: BASE_INPUT,
    })

    const originalUpdatedAt = config.updatedAt

    await updatePixelConfig(config.id, { name: 'Renamed Config' })

    const fetched = await getPixelConfig(config.id)
    expect(fetched?.name).toBe('Renamed Config')
    expect(fetched?.updatedAt).toBeDefined()
    // updatedAt should be a new Timestamp object (different reference)
    expect(fetched?.updatedAt).not.toBe(originalUpdatedAt)
  })

  // ─── Test 4: deletePixelConfig hard-deletes ────────────────────────────────
  it('deletePixelConfig hard-deletes the document', async () => {
    const config = await createPixelConfig({
      orgId: 'org_1',
      createdBy: 'u1',
      input: BASE_INPUT,
    })

    await deletePixelConfig(config.id)

    const fetched = await getPixelConfig(config.id)
    expect(fetched).toBeNull()
  })

  // ─── Test 5: setPlatformCapiToken encrypts and merges ─────────────────────
  it('setPlatformCapiToken encrypts and merges capiTokenEnc into the platform slot', async () => {
    const config = await createPixelConfig({
      orgId: 'org_1',
      createdBy: 'u1',
      input: {
        ...BASE_INPUT,
        meta: { pixelId: 'px_999' },
      },
    })

    // Initially no capiTokenEnc
    expect(config.meta?.capiTokenEnc).toBeUndefined()

    const plaintext = 'my_capi_token_abc'
    await setPlatformCapiToken(config.id, 'meta', plaintext)

    const fetched = await getPixelConfig(config.id)
    expect(fetched?.meta?.pixelId).toBe('px_999') // existing field preserved
    expect(fetched?.meta?.capiTokenEnc).toBeDefined()

    // Ciphertext must not contain plaintext
    const encStr = JSON.stringify(fetched?.meta?.capiTokenEnc)
    expect(encStr).not.toContain(plaintext)

    // Decryption round-trip
    const decrypted = decryptPlatformCapiToken(fetched!, 'meta')
    expect(decrypted).toBe(plaintext)
  })

  // ─── Test 6: cross-tenant isolation ───────────────────────────────────────
  it('isolates pixel configs by orgId — does not leak across tenants', async () => {
    await createPixelConfig({
      orgId: 'org_A',
      createdBy: 'u_a',
      input: { ...BASE_INPUT, name: 'Org A Config' },
    })
    await createPixelConfig({
      orgId: 'org_B',
      createdBy: 'u_b',
      input: { ...BASE_INPUT, name: 'Org B Config' },
    })

    const listA = await listPixelConfigs({ orgId: 'org_A' })
    const listB = await listPixelConfigs({ orgId: 'org_B' })

    expect(listA).toHaveLength(1)
    expect(listA[0].name).toBe('Org A Config')
    expect(listB).toHaveLength(1)
    expect(listB[0].name).toBe('Org B Config')

    // HKDF keys differ per org — org_A token cannot be decrypted under org_B key
    const tokenPlaintext = 'shared_looking_token'
    await setPlatformCapiToken(listA[0].id, 'meta', tokenPlaintext)

    const configA = await getPixelConfig(listA[0].id)
    const configB = await getPixelConfig(listB[0].id)

    // org_A can decrypt its token
    const decryptedA = decryptPlatformCapiToken(configA!, 'meta')
    expect(decryptedA).toBe(tokenPlaintext)

    // org_B has no meta capiTokenEnc — throws
    expect(() => decryptPlatformCapiToken(configB!, 'meta')).toThrow()
  })
})
