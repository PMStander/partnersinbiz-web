import { render } from '@testing-library/react'
import { DocumentTheme } from '@/components/client-documents/theme/DocumentTheme'

test('injects CSS vars from theme.palette', () => {
  const { container } = render(
    <DocumentTheme palette={{ bg: '#0A0A0B', text: '#F7F4EE', accent: '#F5A623' }}>
      <div data-testid="child">x</div>
    </DocumentTheme>,
  )
  const wrapper = container.firstChild as HTMLElement
  expect(wrapper.style.getPropertyValue('--doc-bg')).toBe('#0A0A0B')
  expect(wrapper.style.getPropertyValue('--doc-text')).toBe('#F7F4EE')
  expect(wrapper.style.getPropertyValue('--doc-accent')).toBe('#F5A623')
})

test('derives --doc-accent-soft from accent with alpha', () => {
  const { container } = render(
    <DocumentTheme palette={{ bg: '#000', text: '#fff', accent: '#F5A623' }}>
      <span />
    </DocumentTheme>,
  )
  const wrapper = container.firstChild as HTMLElement
  expect(wrapper.style.getPropertyValue('--doc-accent-soft')).toMatch(/^#f5a62326$/i)
})

test('falls back to PiB defaults when palette omits a field', () => {
  const { container } = render(
    <DocumentTheme palette={{ bg: '', text: '', accent: '' }}>
      <span />
    </DocumentTheme>,
  )
  const wrapper = container.firstChild as HTMLElement
  expect(wrapper.style.getPropertyValue('--doc-bg')).toBe('#0A0A0B')
  expect(wrapper.style.getPropertyValue('--doc-text')).toBe('#F7F4EE')
  expect(wrapper.style.getPropertyValue('--doc-accent')).toBe('#F5A623')
})
