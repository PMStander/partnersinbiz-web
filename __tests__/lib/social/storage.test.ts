jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn().mockReturnValue({
    bucket: jest.fn().mockReturnValue({
      name: 'test-bucket',
      file: jest.fn().mockReturnValue({
        save: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        makePublic: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
}))
jest.mock('@/lib/firebase/admin', () => ({ getAdminApp: jest.fn().mockReturnValue({}) }))

import { uploadMediaToStorage, deleteMediaFromStorage } from '@/lib/social/storage'

describe('uploadMediaToStorage', () => {
  it('returns public URL and storagePath', async () => {
    const buffer = Buffer.from('fake-image-data')
    const result = await uploadMediaToStorage(buffer, 'image/jpeg', 'org-123', 'photo.jpg')
    expect(result.publicUrl).toMatch(/^https:\/\/storage\.googleapis\.com\/test-bucket\/social-media\/org-123\//)
    expect(result.storagePath).toMatch(/^social-media\/org-123\//)
    expect(result.storagePath).toMatch(/\.jpg$/)
  })
})

describe('deleteMediaFromStorage', () => {
  it('calls delete on the file', async () => {
    await expect(deleteMediaFromStorage('social-media/org-123/abc.jpg')).resolves.toBeUndefined()
  })

  it('re-throws unexpected errors', async () => {
    const { getStorage } = jest.requireMock('firebase-admin/storage')
    getStorage().bucket().file().delete.mockRejectedValueOnce(new Error('Permission denied'))
    await expect(deleteMediaFromStorage('social-media/org/file.jpg')).rejects.toThrow('Permission denied')
  })
})
