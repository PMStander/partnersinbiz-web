// components/ui/Button.tsx
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: React.ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const sizes: Record<Size, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  }
  const variants: Record<Variant, string> = {
    primary: 'pib-btn-primary font-label',
    secondary: 'pib-btn-secondary font-label',
    ghost: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-[var(--radius-btn)] transition-all duration-150 active:scale-[0.97] font-label',
    danger: 'bg-error text-on-error rounded-[var(--radius-btn)] transition-all duration-150 hover:opacity-90 active:scale-[0.97] font-label',
  }
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        variants[variant],
        sizes[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          {children}
        </span>
      ) : children}
    </button>
  )
}
