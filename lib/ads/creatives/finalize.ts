// lib/ads/creatives/finalize.ts
import sharp from 'sharp'

/**
 * Probe image dimensions (and video duration in Phase 3b via ffprobe).
 * For videos in Phase 3, returns placeholder values — ffprobe is deferred to Phase 3b.
 */
export async function probeMetadata(args: {
  buffer: Buffer
  mimeType: string
}): Promise<{ width: number; height: number; duration?: number }> {
  if (args.mimeType.startsWith('image/')) {
    const meta = await sharp(args.buffer).metadata()
    return {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    }
  }
  if (args.mimeType.startsWith('video/')) {
    // Phase 3 placeholder — video metadata requires ffprobe (Phase 3b)
    return { width: 0, height: 0, duration: 0 }
  }
  throw new Error(`Unsupported mimeType for probe: ${args.mimeType}`)
}

/**
 * Generate a 360p preview JPEG.
 * For images: resize to max 360px height, encode as JPEG at 80% quality.
 * For videos: returns null in Phase 3 (Phase 3b adds ffmpeg frame extraction).
 */
export async function generatePreview(args: {
  buffer: Buffer
  mimeType: string
}): Promise<Buffer | null> {
  if (args.mimeType.startsWith('image/')) {
    return sharp(args.buffer)
      .resize({ height: 360, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
  }
  // Videos: no preview in Phase 3 (Phase 3b adds ffmpeg frame extraction)
  return null
}
