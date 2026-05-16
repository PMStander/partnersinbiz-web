import { render } from '@testing-library/react'
import { ImageBlock } from '@/components/client-documents/blocks/ImageBlock'

test('renders img with src, alt, lazy loading, and caption', () => {
  const block = {
    id: 'img1',
    type: 'image' as const,
    title: '',
    content: {
      url: 'https://images.example.com/hero.jpg',
      alt: 'A hero image',
      caption: 'Figure 1',
    },
    required: false,
    display: {},
  }
  const { container } = render(<ImageBlock block={block} index={0} />)
  const img = container.querySelector('img')
  expect(img).not.toBeNull()
  expect(img?.getAttribute('src')).toBe('https://images.example.com/hero.jpg')
  expect(img?.getAttribute('alt')).toBe('A hero image')
  expect(img?.getAttribute('loading')).toBe('lazy')
  const caption = container.querySelector('figcaption')
  expect(caption?.textContent).toBe('Figure 1')
})

test('applies wide width class when width=wide', () => {
  const block = {
    id: 'img2',
    type: 'image' as const,
    title: '',
    content: {
      url: 'https://images.example.com/x.jpg',
      width: 'wide' as const,
    },
    required: false,
    display: {},
  }
  const { container } = render(<ImageBlock block={block} index={0} />)
  const figure = container.querySelector('figure')
  expect(figure?.className).toContain('max-w-[110%]')
  expect(figure?.className).toContain('-mx-[5%]')
})

test('applies full width class when width=full', () => {
  const block = {
    id: 'img3',
    type: 'image' as const,
    title: '',
    content: {
      url: 'https://images.example.com/x.jpg',
      width: 'full' as const,
    },
    required: false,
    display: {},
  }
  const { container } = render(<ImageBlock block={block} index={0} />)
  const figure = container.querySelector('figure')
  expect(figure?.className).toContain('max-w-[140%]')
})

test('defaults to normal width when width missing', () => {
  const block = {
    id: 'img4',
    type: 'image' as const,
    title: '',
    content: { url: 'https://images.example.com/x.jpg' },
    required: false,
    display: {},
  }
  const { container } = render(<ImageBlock block={block} index={0} />)
  const figure = container.querySelector('figure')
  expect(figure?.className).toContain('max-w-full')
})

test('omits figcaption when caption missing', () => {
  const block = {
    id: 'img5',
    type: 'image' as const,
    title: '',
    content: { url: 'https://images.example.com/x.jpg' },
    required: false,
    display: {},
  }
  const { container } = render(<ImageBlock block={block} index={0} />)
  expect(container.querySelector('figcaption')).toBeNull()
})
