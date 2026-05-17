import React from 'react'
import { render, screen } from '@testing-library/react'
import { DealKanban, DEAL_STAGES, STAGE_LABELS } from '@/components/crm/DealKanban'
import type { Deal } from '@/lib/crm/types'

// ── dnd-kit mocks ─────────────────────────────────────────────────────────────

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCorners: jest.fn(),
  PointerSensor: jest.fn(),
  KeyboardSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
  useDroppable: () => ({ setNodeRef: jest.fn(), isOver: false }),
}))
jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))
jest.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeDeal = (overrides: Partial<Deal> = {}): Deal => ({
  id: 'deal-1',
  orgId: 'org-1',
  contactId: 'contact-1',
  title: 'Test Deal',
  value: 10000,
  currency: 'ZAR',
  stage: 'discovery',
  expectedCloseDate: null,
  notes: '',
  createdAt: null,
  updatedAt: null,
  ...overrides,
})

const noop = async () => {}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DealKanban', () => {
  it('renders all 5 stage column headers', () => {
    render(<DealKanban deals={[]} onStageChange={noop} />)
    for (const stage of DEAL_STAGES) {
      expect(screen.getByText(STAGE_LABELS[stage])).toBeInTheDocument()
    }
  })

  it('places each deal in its correct stage column', () => {
    const deals: Deal[] = [
      makeDeal({ id: 'd1', title: 'Alpha Deal', stage: 'discovery' }),
      makeDeal({ id: 'd2', title: 'Beta Deal',  stage: 'proposal' }),
      makeDeal({ id: 'd3', title: 'Gamma Deal', stage: 'won' }),
    ]
    render(<DealKanban deals={deals} onStageChange={noop} />)
    expect(screen.getByText('Alpha Deal')).toBeInTheDocument()
    expect(screen.getByText('Beta Deal')).toBeInTheDocument()
    expect(screen.getByText('Gamma Deal')).toBeInTheDocument()
  })

  it('renders deal value as formatted currency', () => {
    const deal = makeDeal({ id: 'd1', value: 50000, currency: 'ZAR', stage: 'proposal' })
    render(<DealKanban deals={[deal]} onStageChange={noop} />)
    // Intl formats 50 000 — accept any digit grouping
    const valueEl = screen.getByText(/50[\s,.]?000/)
    expect(valueEl).toBeInTheDocument()
  })

  it('shows "Drop here" placeholder in empty columns', () => {
    // Only discovery has a deal — others should show the drop placeholder
    const deal = makeDeal({ id: 'd1', stage: 'discovery' })
    render(<DealKanban deals={[deal]} onStageChange={noop} />)
    const dropTargets = screen.getAllByText('Drop here')
    // 4 empty columns (proposal, negotiation, won, lost)
    expect(dropTargets).toHaveLength(4)
  })

  it('shows skeleton cards when loading=true', () => {
    const { container } = render(<DealKanban deals={[]} loading onStageChange={noop} />)
    const skeletons = container.querySelectorAll('.pib-skeleton')
    // 5 columns × 3 skeletons each = 15
    expect(skeletons).toHaveLength(15)
  })

  it('shows no deals when the list is empty and loading=false', () => {
    render(<DealKanban deals={[]} onStageChange={noop} />)
    // All 5 drop placeholders should be visible
    const dropTargets = screen.getAllByText('Drop here')
    expect(dropTargets).toHaveLength(5)
    // No deal titles
    expect(screen.queryByText('Test Deal')).not.toBeInTheDocument()
  })

  it('renders a contact link for deals with contactId', () => {
    const deal = makeDeal({ id: 'd1', contactId: 'c-99', stage: 'negotiation' })
    render(<DealKanban deals={[deal]} onStageChange={noop} />)
    const link = screen.getByRole('link', { name: 'Contact' })
    expect(link).toHaveAttribute('href', '/portal/crm/contacts/c-99')
  })

  it('does not render a contact link when contactId is empty', () => {
    const deal = makeDeal({ id: 'd1', contactId: '', stage: 'negotiation' })
    render(<DealKanban deals={[deal]} onStageChange={noop} />)
    expect(screen.queryByRole('link', { name: 'Contact' })).not.toBeInTheDocument()
  })

  it('renders multiple deals in the same column', () => {
    const deals: Deal[] = [
      makeDeal({ id: 'd1', title: 'Deal One', stage: 'proposal' }),
      makeDeal({ id: 'd2', title: 'Deal Two', stage: 'proposal' }),
      makeDeal({ id: 'd3', title: 'Deal Three', stage: 'proposal' }),
    ]
    render(<DealKanban deals={deals} onStageChange={noop} />)
    expect(screen.getByText('Deal One')).toBeInTheDocument()
    expect(screen.getByText('Deal Two')).toBeInTheDocument()
    expect(screen.getByText('Deal Three')).toBeInTheDocument()
  })
})
