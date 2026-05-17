import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { CompaniesTable } from '@/components/crm/CompaniesTable'
import type { Company } from '@/lib/companies/types'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeCompany = (overrides: Partial<Company> = {}): Company => ({
  id: 'co-1',
  orgId: 'org-1',
  name: 'ACME Corp',
  tags: [],
  notes: '',
  createdAt: null,
  updatedAt: null,
  ...overrides,
})

const noop = () => {}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CompaniesTable', () => {
  it('renders table headers', () => {
    render(<CompaniesTable companies={[]} loading={false} onRowClick={noop} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Industry')).toBeInTheDocument()
    expect(screen.getByText('Tier')).toBeInTheDocument()
    expect(screen.getByText('Lifecycle')).toBeInTheDocument()
  })

  it('renders empty state when no companies', () => {
    render(<CompaniesTable companies={[]} loading={false} onRowClick={noop} />)
    expect(
      screen.getByText(/No companies yet/i),
    ).toBeInTheDocument()
  })

  it('renders loading state when loading=true', () => {
    const { container } = render(
      <CompaniesTable companies={[]} loading={true} onRowClick={noop} />,
    )
    const skeletons = container.querySelectorAll('.pib-skeleton')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders company rows', () => {
    const companies = [
      makeCompany({ id: 'co-1', name: 'ACME Corp' }),
      makeCompany({ id: 'co-2', name: 'Globex Inc' }),
    ]
    render(<CompaniesTable companies={companies} loading={false} onRowClick={noop} />)
    expect(screen.getByText('ACME Corp')).toBeInTheDocument()
    expect(screen.getByText('Globex Inc')).toBeInTheDocument()
  })

  it('calls onRowClick with the company id when a row is clicked', () => {
    const handleClick = jest.fn()
    const company = makeCompany({ id: 'co-42', name: 'Click Me Inc' })
    render(
      <CompaniesTable companies={[company]} loading={false} onRowClick={handleClick} />,
    )
    fireEvent.click(screen.getByText('Click Me Inc'))
    expect(handleClick).toHaveBeenCalledWith('co-42')
  })

  it('renders tier chip when tier is set', () => {
    const company = makeCompany({ id: 'co-1', tier: 'enterprise' })
    render(<CompaniesTable companies={[company]} loading={false} onRowClick={noop} />)
    expect(screen.getByText('enterprise')).toBeInTheDocument()
  })

  it('renders lifecycleStage chip when set', () => {
    const company = makeCompany({ id: 'co-1', lifecycleStage: 'customer' })
    render(<CompaniesTable companies={[company]} loading={false} onRowClick={noop} />)
    expect(screen.getByText('customer')).toBeInTheDocument()
  })

  it('renders industry when set', () => {
    const company = makeCompany({ id: 'co-1', industry: 'SaaS' })
    render(<CompaniesTable companies={[company]} loading={false} onRowClick={noop} />)
    expect(screen.getByText('SaaS')).toBeInTheDocument()
  })

  it('shows multiple rows for multiple companies', () => {
    const companies = [
      makeCompany({ id: 'co-1', name: 'Alpha' }),
      makeCompany({ id: 'co-2', name: 'Beta' }),
      makeCompany({ id: 'co-3', name: 'Gamma' }),
    ]
    render(<CompaniesTable companies={companies} loading={false} onRowClick={noop} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })
})
