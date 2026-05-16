import { render, screen } from '@testing-library/react'
import { GalleryBlock } from '@/components/client-documents/blocks/GalleryBlock'

const baseBlock = {
  id: 'g1',
  type: 'gallery' as const,
  title: 'Past work',
  content: [
    'https://images.example.com/a.jpg',
    'https://images.example.com/b.jpg',
    'https://images.example.com/c.jpg',
  ],
  required: false,
  display: {},
}

test('renders title', () => {
  render(<GalleryBlock block={baseBlock} index={0} />)
  expect(screen.getByText('Past work')).not.toBeNull()
})

test('renders all images with src and lazy loading', () => {
  const { container } = render(<GalleryBlock block={baseBlock} index={0} />)
  const imgs = container.querySelectorAll('img')
  expect(imgs.length).toBe(3)
  expect(imgs[0]?.getAttribute('src')).toBe('https://images.example.com/a.jpg')
  expect(imgs[0]?.getAttribute('loading')).toBe('lazy')
  expect(imgs[2]?.getAttribute('src')).toBe('https://images.example.com/c.jpg')
})
