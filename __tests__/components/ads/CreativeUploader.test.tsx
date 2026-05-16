/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CreativeUploader } from '@/components/ads/CreativeUploader'

// jsdom provides URL.createObjectURL only sometimes; polyfill
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = jest.fn(() => 'blob:fake-url') as any
  URL.revokeObjectURL = jest.fn() as any
}

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})

describe('CreativeUploader', () => {
  it('shows idle state with Choose a file button', () => {
    render(<CreativeUploader orgId="org_1" />)
    expect(screen.getByText('Choose a file')).toBeInTheDocument()
  })

  it('previews a picked image and shows Upload button', async () => {
    render(<CreativeUploader orgId="org_1" />)
    const file = new File(['fake'], 'hero.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText(/file input/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    expect(screen.getByText('Upload')).toBeInTheDocument()
    expect(screen.getByLabelText(/Creative name/i)).toHaveValue('hero')
  })

  it('rejects files larger than 100MB', async () => {
    render(<CreativeUploader orgId="org_1" />)
    const huge = { size: 101 * 1024 * 1024, type: 'image/jpeg', name: 'big.jpg' } as File
    const input = screen.getByLabelText(/file input/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [huge] } })
    })
    expect(screen.getByText(/Upload failed/)).toBeInTheDocument()
    expect(screen.getByText(/File too large/)).toBeInTheDocument()
  })

  it('runs the 3-step upload flow and calls onUploaded', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { creativeId: 'crv_x', uploadUrl: 'https://signed/x', expiresAt: Date.now() + 100000 },
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'crv_x', name: 'hero', width: 1200, height: 1200 },
        }),
      })

    const onUploaded = jest.fn()
    render(<CreativeUploader orgId="org_1" onUploaded={onUploaded} />)
    const file = new File(['fake'], 'hero.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText(/file input/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Upload'))
    })
    await waitFor(() => expect(onUploaded).toHaveBeenCalled())
    expect(onUploaded).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'crv_x', name: 'hero' }),
    )
    expect(screen.getByText(/Uploaded successfully/)).toBeInTheDocument()
  })

  it('shows error UI when upload-url POST fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: 'Unauthorized' }),
    })
    render(<CreativeUploader orgId="org_1" />)
    const file = new File(['fake'], 'hero.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText(/file input/i) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Upload'))
    })
    await waitFor(() => expect(screen.getByText(/Unauthorized/)).toBeInTheDocument())
  })
})
