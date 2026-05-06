// __tests__/api/embed-form.test.ts
//
// Tests for the embeddable form widget route at GET /embed/form/[publicKey].
// The route returns inline JS that the host site loads as a <script> tag.

const mockGet = jest.fn()
const mockLimit = jest.fn()
const mockWhere = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, limit: mockLimit, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

function makeReq(): Request {
  return new Request('http://localhost/embed/form/test-key')
}

describe('GET /embed/form/[publicKey]', () => {
  it('returns 404 with JS no-op when publicKey is not found', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })
    const { GET } = await import('@/app/embed/form/[publicKey]/route')
    const res = await GET(makeReq(), { params: Promise.resolve({ publicKey: 'missing-key' }) })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/javascript')
    const body = await res.text()
    expect(body).toContain('console.warn')
    expect(body).toContain('Widget unavailable')
  })

  it('returns 200 application/javascript when source is enabled', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'src1',
          data: () => ({
            orgId: 'org1',
            name: 'Newsletter Signup',
            type: 'form',
            publicKey: 'abc123key',
            enabled: true,
            deleted: false,
            consentRequired: true,
            redirectUrl: 'https://example.com/thanks',
            autoTags: [],
            autoCampaignIds: [],
            capturedCount: 0,
            lastCapturedAt: null,
          }),
        },
      ],
    })
    const { GET } = await import('@/app/embed/form/[publicKey]/route')
    const res = await GET(makeReq(), { params: Promise.resolve({ publicKey: 'abc123key' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/javascript')
    expect(res.headers.get('cache-control')).toContain('max-age=300')

    const body = await res.text()
    // The publicKey must be embedded in the POST URL inside the widget config.
    expect(body).toContain('abc123key')
    expect(body).toContain('/api/public/capture/abc123key')
    // Consent label uses the source name.
    expect(body).toContain('Newsletter Signup')
    // Honeypot field is rendered.
    expect(body).toContain('_hp')
    // Renders into div[data-pib-form].
    expect(body).toContain('data-pib-form')
  })

  it('returns the not-found JS when source is disabled', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'src2',
          data: () => ({
            orgId: 'org1',
            name: 'Disabled Form',
            type: 'form',
            publicKey: 'disabledkey',
            enabled: false,
            deleted: false,
            consentRequired: false,
            redirectUrl: '',
            autoTags: [],
            autoCampaignIds: [],
            capturedCount: 0,
            lastCapturedAt: null,
          }),
        },
      ],
    })
    const { GET } = await import('@/app/embed/form/[publicKey]/route')
    const res = await GET(makeReq(), { params: Promise.resolve({ publicKey: 'disabledkey' }) })
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).toContain('Widget unavailable')
    // Disabled sources should NOT leak the source name.
    expect(body).not.toContain('Disabled Form')
  })

  it('returns the not-found JS when source is soft-deleted', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'src3',
          data: () => ({
            orgId: 'org1',
            name: 'Deleted Form',
            type: 'form',
            publicKey: 'deletedkey',
            enabled: true,
            deleted: true,
            consentRequired: false,
            redirectUrl: '',
            autoTags: [],
            autoCampaignIds: [],
            capturedCount: 0,
            lastCapturedAt: null,
          }),
        },
      ],
    })
    const { GET } = await import('@/app/embed/form/[publicKey]/route')
    const res = await GET(makeReq(), { params: Promise.resolve({ publicKey: 'deletedkey' }) })
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).toContain('Widget unavailable')
    expect(body).not.toContain('Deleted Form')
  })
})
