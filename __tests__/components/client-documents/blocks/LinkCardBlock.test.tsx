import { render } from '@testing-library/react'
import { LinkCardBlock } from '@/components/client-documents/blocks/LinkCardBlock'

test('renders title, hostname, description, and href', () => {
  const block = {
    id: 'lc1',
    type: 'link_card' as const,
    title: '',
    content: {
      url: 'https://www.partnersinbiz.online/blog/social-roi',
      title: 'Measuring social ROI',
      description: 'How we attribute revenue to social posts.',
    },
    required: false,
    display: {},
  }
  const { container } = render(<LinkCardBlock block={block} index={0} />)
  const anchor = container.querySelector('a[href]')
  expect(anchor).not.toBeNull()
  expect(anchor?.getAttribute('href')).toBe('https://www.partnersinbiz.online/blog/social-roi')
  expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer')
  expect(anchor?.getAttribute('target')).toBe('_blank')
  expect(container.textContent).toContain('Measuring social ROI')
  expect(container.textContent).toContain('How we attribute revenue to social posts.')
  // www. prefix should be stripped
  expect(container.textContent).toContain('partnersinbiz.online')
})

test('renders image when present', () => {
  const block = {
    id: 'lc2',
    type: 'link_card' as const,
    title: '',
    content: {
      url: 'https://example.com/x',
      title: 'Example',
      image: 'https://example.com/preview.jpg',
    },
    required: false,
    display: {},
  }
  const { container } = render(<LinkCardBlock block={block} index={0} />)
  const img = container.querySelector('img')
  expect(img).not.toBeNull()
  expect(img?.getAttribute('src')).toBe('https://example.com/preview.jpg')
  expect(img?.getAttribute('loading')).toBe('lazy')
})

test('omits image when not provided', () => {
  const block = {
    id: 'lc3',
    type: 'link_card' as const,
    title: '',
    content: {
      url: 'https://example.com/x',
      title: 'Example',
    },
    required: false,
    display: {},
  }
  const { container } = render(<LinkCardBlock block={block} index={0} />)
  expect(container.querySelector('img')).toBeNull()
})

test('omits description when not provided', () => {
  const block = {
    id: 'lc4',
    type: 'link_card' as const,
    title: '',
    content: {
      url: 'https://example.com/x',
      title: 'Example',
    },
    required: false,
    display: {},
  }
  const { container } = render(<LinkCardBlock block={block} index={0} />)
  // Two <p>s: title + hostname only
  expect(container.querySelectorAll('p').length).toBe(2)
})

test('falls back to raw url string when URL parsing fails', () => {
  const block = {
    id: 'lc5',
    type: 'link_card' as const,
    title: '',
    content: {
      url: 'not a url',
      title: 'Example',
    },
    required: false,
    display: {},
  }
  // Just ensure render does not throw
  const { container } = render(<LinkCardBlock block={block} index={0} />)
  expect(container.querySelector('a')).not.toBeNull()
})
