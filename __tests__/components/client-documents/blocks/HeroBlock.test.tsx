import { render, screen } from '@testing-library/react'
import { HeroBlock } from '@/components/client-documents/blocks/HeroBlock'

const baseBlock = {
  id: 'h1',
  type: 'hero' as const,
  title: 'PROPOSAL',
  content: 'A breakthrough campaign for your brand',
  required: true,
  display: {},
}

test('renders subtitle from block.content', () => {
  render(<HeroBlock block={baseBlock} index={0} />)
  expect(screen.getByText('A breakthrough campaign for your brand')).not.toBeNull()
})

test('renders eyebrow from block.title', () => {
  render(<HeroBlock block={baseBlock} index={0} />)
  expect(screen.getByText('PROPOSAL')).not.toBeNull()
})

test('renders accent stripe', () => {
  render(<HeroBlock block={baseBlock} index={0} />)
  expect(screen.getByTestId('hero-stripe')).not.toBeNull()
})

test('sets min-height of 50vh', () => {
  const { container } = render(<HeroBlock block={baseBlock} index={0} />)
  expect(container.querySelector('.min-h-\\[50vh\\]')).not.toBeNull()
})
