import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { ShareSettingsPanel } from '@/components/client-documents/share/ShareSettingsPanel'
import type { ClientDocument } from '@/lib/client-documents/types'

function makeDoc(overrides: Partial<ClientDocument> = {}): ClientDocument {
  return {
    id: 'doc1',
    title: 'Test Doc',
    type: 'sales_proposal',
    templateId: 'tmpl',
    status: 'internal_draft',
    linked: {},
    currentVersionId: 'v1',
    approvalMode: 'none',
    clientPermissions: {
      canComment: true,
      canSuggest: true,
      canDirectEdit: false,
      canApprove: true,
    },
    assumptions: [],
    shareToken: 'view-tok',
    shareEnabled: false,
    editShareEnabled: false,
    createdBy: 'u',
    createdByType: 'agent',
    updatedBy: 'u',
    updatedByType: 'agent',
    deleted: false,
    ...overrides,
  } as ClientDocument
}

describe('ShareSettingsPanel', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global as any).fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  test('renders view-only URL when share is enabled', () => {
    const doc = makeDoc({ shareEnabled: true, shareToken: 'view-tok-123' })
    const { container } = render(
      <ShareSettingsPanel
        document={doc}
        baseUrl="https://example.com"
        onChange={() => {}}
      />,
    )
    expect(container.textContent).toContain('https://example.com/d/view-tok-123')
  })

  test('renders the enable button when edit share is disabled', () => {
    const doc = makeDoc({ editShareEnabled: false })
    const { getByText } = render(
      <ShareSettingsPanel document={doc} baseUrl="https://x.test" onChange={() => {}} />,
    )
    expect(getByText('Enable edit link')).not.toBeNull()
  })

  test('clicking enable POSTs and calls onChange with the new token + code', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: { editShareToken: 'edit-tok-abc', editAccessCode: 'ABC123' },
      }),
    })
    const onChange = jest.fn()
    const doc = makeDoc({ editShareEnabled: false })
    const { getByText } = render(
      <ShareSettingsPanel document={doc} baseUrl="https://x.test" onChange={onChange} />,
    )
    await act(async () => {
      fireEvent.click(getByText('Enable edit link'))
    })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/client-documents/doc1/edit-share/enable',
      { method: 'POST' },
    )
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0]).toMatchObject({
      editShareEnabled: true,
      editShareToken: 'edit-tok-abc',
      editAccessCode: 'ABC123',
    })
  })

  test('clicking regenerate POSTs and updates the access code', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: true, data: { editAccessCode: 'NEW999' } }),
    })
    const onChange = jest.fn()
    const doc = makeDoc({
      editShareEnabled: true,
      editShareToken: 'edit-tok-xyz',
      editAccessCode: 'OLD000',
    })
    const { getByText } = render(
      <ShareSettingsPanel document={doc} baseUrl="https://x.test" onChange={onChange} />,
    )
    await act(async () => {
      fireEvent.click(getByText('Regenerate'))
    })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/client-documents/doc1/edit-share/regenerate-code',
      { method: 'POST' },
    )
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0]).toMatchObject({ editAccessCode: 'NEW999' })
  })

  test('clicking disable POSTs and flips editShareEnabled to false', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: true, data: {} }),
    })
    const onChange = jest.fn()
    const doc = makeDoc({
      editShareEnabled: true,
      editShareToken: 'edit-tok-xyz',
      editAccessCode: 'OLD000',
    })
    const { getByText } = render(
      <ShareSettingsPanel document={doc} baseUrl="https://x.test" onChange={onChange} />,
    )
    await act(async () => {
      fireEvent.click(getByText('Disable edit link'))
    })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/client-documents/doc1/edit-share/disable',
      { method: 'POST' },
    )
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0]).toMatchObject({ editShareEnabled: false })
  })

  test('shows error when API returns success:false', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ success: false, error: 'Forbidden' }),
    })
    const doc = makeDoc({ editShareEnabled: false })
    const { getByText, container } = render(
      <ShareSettingsPanel document={doc} baseUrl="https://x.test" onChange={() => {}} />,
    )
    await act(async () => {
      fireEvent.click(getByText('Enable edit link'))
    })
    await waitFor(() => expect(container.textContent).toContain('Forbidden'))
  })
})
