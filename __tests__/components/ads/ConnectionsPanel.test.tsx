/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ConnectionsPanel } from '@/components/ads/ConnectionsPanel'

describe('ConnectionsPanel', () => {
  it('shows the "Connect Meta" CTA when no Meta connection exists', () => {
    render(<ConnectionsPanel orgSlug="acme" orgId="org_1" connections={[]} />)
    expect(screen.getByText(/Connect Meta/i)).toBeInTheDocument()
  })

  it('renders ad accounts list when a Meta connection is present', () => {
    render(
      <ConnectionsPanel
        orgSlug="acme"
        orgId="org_1"
        connections={[
          {
            id: 'c1',
            orgId: 'org_1',
            platform: 'meta',
            status: 'active',
            userId: 'u',
            scopes: [],
            adAccounts: [
              { id: 'act_42', name: 'Brand X', currency: 'USD', timezone: 'UTC' },
            ],
            defaultAdAccountId: 'act_42',
          } as any,
        ]}
      />,
    )
    expect(screen.getByText(/Brand X/)).toBeInTheDocument()
    expect(screen.getByText(/act_42/)).toBeInTheDocument()
  })
})
