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
    sm: '!px-3 !py-1.5 !text-xs',
    md: '!px-4 !py-2 !text-sm',
    lg: '!px-6 !py-2.5 !text-base',
  }
  const variants: Record<Variant, string> = {
    primary: 'pib-btn-primary',
    secondary: 'pib-btn-secondary',
    ghost:
      'inline-flex items-center gap-2 text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.04] rounded-full transition-all duration-150 active:scale-[0.98] font-medium',
    danger:
      'inline-flex items-center gap-2 bg-[#FCA5A5]/10 border border-[#FCA5A5]/40 text-[#FCA5A5] rounded-full transition-all duration-150 hover:bg-[#FCA5A5]/15 hover:border-[#FCA5A5]/60 active:scale-[0.98] font-medium',
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
      ) : (
        children
      )}
    </button>
  )
}
