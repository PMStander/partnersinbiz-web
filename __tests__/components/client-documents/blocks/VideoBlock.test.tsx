import { render } from '@testing-library/react'
import { VideoBlock } from '@/components/client-documents/blocks/VideoBlock'

test('renders YouTube iframe for v= URL', () => {
  const block = {
    id: 'v1',
    type: 'video' as const,
    title: '',
    content: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    required: false,
    display: {},
  }
  const { container } = render(<VideoBlock block={block} index={0} />)
  const iframe = container.querySelector('iframe')
  expect(iframe).not.toBeNull()
  expect(iframe?.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  expect(iframe?.getAttribute('loading')).toBe('lazy')
  expect(iframe?.getAttribute('allow')).toContain('encrypted-media')
})

test('renders YouTube iframe for youtu.be short URL', () => {
  const block = {
    id: 'v2',
    type: 'video' as const,
    title: '',
    content: { url: 'https://youtu.be/dQw4w9WgXcQ' },
    required: false,
    display: {},
  }
  const { container } = render(<VideoBlock block={block} index={0} />)
  const iframe = container.querySelector('iframe')
  expect(iframe?.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
})

test('detects Loom and converts share to embed URL', () => {
  const block = {
    id: 'v3',
    type: 'video' as const,
    title: '',
    content: { url: 'https://www.loom.com/share/abc123' },
    required: false,
    display: {},
  }
  const { container } = render(<VideoBlock block={block} index={0} />)
  const iframe = container.querySelector('iframe')
  expect(iframe?.getAttribute('src')).toBe('https://www.loom.com/embed/abc123')
})

test('detects Vimeo and converts to player URL', () => {
  const block = {
    id: 'v4',
    type: 'video' as const,
    title: '',
    content: { url: 'https://vimeo.com/123456789' },
    required: false,
    display: {},
  }
  const { container } = render(<VideoBlock block={block} index={0} />)
  const iframe = container.querySelector('iframe')
  expect(iframe?.getAttribute('src')).toBe('https://player.vimeo.com/video/123456789')
})

test('renders caption as figcaption', () => {
  const block = {
    id: 'v5',
    type: 'video' as const,
    title: '',
    content: {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      caption: 'Demo clip',
    },
    required: false,
    display: {},
  }
  const { container } = render(<VideoBlock block={block} index={0} />)
  expect(container.querySelector('figcaption')?.textContent).toBe('Demo clip')
})
