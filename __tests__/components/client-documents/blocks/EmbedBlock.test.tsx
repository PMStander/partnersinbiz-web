import { render } from '@testing-library/react'
import { EmbedBlock } from '@/components/client-documents/blocks/EmbedBlock'

test('renders iframe for allowed host (calendly)', () => {
  const block = {
    id: 'e1',
    type: 'embed' as const,
    title: 'Book a call',
    content: { url: 'https://calendly.com/peet/intro' },
    required: false,
    display: {},
  }
  const { container } = render(<EmbedBlock block={block} index={0} />)
  const iframe = container.querySelector('iframe')
  expect(iframe).not.toBeNull()
  expect(iframe?.getAttribute('src')).toBe('https://calendly.com/peet/intro')
  expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts')
  expect(container.querySelector('a[href]')).toBeNull()
})

test('renders link fallback for blocked host', () => {
  const block = {
    id: 'e2',
    type: 'embed' as const,
    title: '',
    content: { url: 'https://evil.example.com/x' },
    required: false,
    display: {},
  }
  const { container } = render(<EmbedBlock block={block} index={0} />)
  expect(container.querySelector('iframe')).toBeNull()
  const link = container.querySelector('a[href]')
  expect(link).not.toBeNull()
  expect(link?.getAttribute('href')).toBe('https://evil.example.com/x')
  expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
})

test('respects custom height', () => {
  const block = {
    id: 'e3',
    type: 'embed' as const,
    title: '',
    content: { url: 'https://tally.so/r/abc', height: 700 },
    required: false,
    display: {},
  }
  const { container } = render(<EmbedBlock block={block} index={0} />)
  const wrapper = container.querySelector('div[style*="height"]')
  expect(wrapper?.getAttribute('style') ?? '').toMatch(/height:\s*700/)
})

test('uses default 500px height', () => {
  const block = {
    id: 'e4',
    type: 'embed' as const,
    title: '',
    content: { url: 'https://tally.so/r/abc' },
    required: false,
    display: {},
  }
  const { container } = render(<EmbedBlock block={block} index={0} />)
  const wrapper = container.querySelector('div[style*="height"]')
  expect(wrapper?.getAttribute('style') ?? '').toMatch(/height:\s*500/)
})

test('renders caption when present', () => {
  const block = {
    id: 'e5',
    type: 'embed' as const,
    title: '',
    content: { url: 'https://tally.so/r/abc', caption: 'Schedule a slot' },
    required: false,
    display: {},
  }
  const { container } = render(<EmbedBlock block={block} index={0} />)
  expect(container.textContent).toContain('Schedule a slot')
})
