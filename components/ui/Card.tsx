// components/ui/Card.tsx
import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export function Card({ children, className, hover, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'pib-card',
        hover && 'pib-card-hover cursor-pointer',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
  trend?: 'up' | 'down' | 'neutral'
  accent?: boolean
  onClick?: () => void
}

export function MetricCard({ label, value, sub, trend, accent, onClick }: MetricCardProps) {
  return (
    <Card hover={!!onClick} onClick={onClick} className="space-y-1">
      <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className={cn(
        'text-3xl font-headline font-bold',
        accent ? 'text-[var(--color-accent-v2)]' : 'text-on-surface',
      )}>
        {value}
      </p>
      {sub && (
        <p className="text-xs text-on-surface-variant flex items-center gap-1">
          {trend === 'up' && <span className="text-green-400">↑</span>}
          {trend === 'down' && <span className="text-red-400">↓</span>}
          {sub}
        </p>
      )}
    </Card>
  )
}
