import { probeMetadata, generatePreview } from '@/lib/ads/creatives/finalize'
import sharp from 'sharp'

async function makeTinyJpeg(width = 100, height = 50): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer()
}

describe('probeMetadata', () => {
  it('reads width + height from image bytes', async () => {
    const buf = await makeTinyJpeg()
    const r = await probeMetadata({ buffer: buf, mimeType: 'image/jpeg' })
    expect(r.width).toBe(100)
    expect(r.height).toBe(50)
  })

  it('returns placeholder for video in Phase 3', async () => {
    const r = await probeMetadata({ buffer: Buffer.from('fake'), mimeType: 'video/mp4' })
    expect(r).toEqual({ width: 0, height: 0, duration: 0 })
  })

  it('throws on unsupported mime', async () => {
    await expect(
      probeMetadata({ buffer: Buffer.alloc(0), mimeType: 'application/pdf' }),
    ).rejects.toThrow(/Unsupported/)
  })
})

describe('generatePreview', () => {
  it('resizes image to max 360px height', async () => {
    // Make a 1000x800 source — should resize to ~450x360
    const source = await sharp({
      create: { width: 1000, height: 800, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .jpeg()
      .toBuffer()
    const preview = await generatePreview({ buffer: source, mimeType: 'image/jpeg' })
    expect(preview).not.toBeNull()
    const meta = await sharp(preview!).metadata()
    expect(meta.height).toBe(360)
  })

  it('returns null for video', async () => {
    const r = await generatePreview({ buffer: Buffer.from('fake'), mimeType: 'video/mp4' })
    expect(r).toBeNull()
  })
})
