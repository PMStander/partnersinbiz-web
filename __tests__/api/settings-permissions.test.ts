import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: Function) =>
    (req: NextRequest, ...args: any[]) => handler(req, 'uid-1', 'org-1', 'owner', ...args),
}))
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate })
  mockCollection.mockReturnValue({ doc: mockDoc })
})

describe('GET /api/v1/portal/settings/permissions', () => {
  it('returns default permissions when no settings doc', async () => {
    mockGet.mockResolvedValue({ exists: false })

    const { GET } = await import('@/app/api/v1/portal/settings/permissions/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/permissions', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.permissions).toEqual({
      membersCanDeleteContacts: false,
      membersCanExportContacts: false,
      membersCanSendCampaigns: true,
    })
  })

  it('returns stored permissions when doc has settings', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        settings: {
          permissions: { membersCanDeleteContacts: true, membersCanExportContacts: false, membersCanSendCampaigns: true },
        },
      }),
    })

    const { GET } = await import('@/app/api/v1/portal/settings/permissions/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/permissions', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect(body.permissions.membersCanDeleteContacts).toBe(true)
    expect(body.permissions.membersCanSendCampaigns).toBe(true)
  })
})

describe('PATCH /api/v1/portal/settings/permissions', () => {
  it('updates only provided boolean toggles', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        settings: {
          permissions: { membersCanDeleteContacts: false, membersCanExportContacts: false, membersCanSendCampaigns: true },
        },
      }),
    })
    mockUpdate.mockResolvedValue(undefined)

    const { PATCH } = await import('@/app/api/v1/portal/settings/permissions/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/permissions', {
      method: 'PATCH',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ membersCanDeleteContacts: true }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ 'settings.permissions.membersCanDeleteContacts': true })
    )
    // Should NOT include other keys that weren't in the request
    const updateArg = mockUpdate.mock.calls[0][0]
    expect(updateArg).not.toHaveProperty('settings.permissions.membersCanExportContacts')
  })

  it('returns 400 when no valid toggle is provided', async () => {
    const { PATCH } = await import('@/app/api/v1/portal/settings/permissions/route')
    const req = new NextRequest('http://localhost/api/v1/portal/settings/permissions', {
      method: 'PATCH',
      headers: { Cookie: '__session=valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ unknownField: true }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
