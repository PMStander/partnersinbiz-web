interface AdminTopbarProps {
  userEmail: string
}

export function AdminTopbar({ userEmail }: AdminTopbarProps) {
  return (
    <header className="h-12 flex items-center justify-between px-6 border-b border-[var(--color-card-border)] bg-black/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-label uppercase tracking-widest text-on-surface-variant">
          Partners in Biz
        </span>
        <span className="w-1 h-1 rounded-full bg-[var(--color-outline-variant)]" />
        <span className="text-[11px] font-label text-on-surface-variant/60">
          Admin
        </span>
      </div>
      <div className="flex items-center gap-5">
        <span className="text-[11px] font-label text-on-surface-variant">{userEmail}</span>
        <a
          href="/api/auth/logout"
          className="text-[11px] font-label text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Sign out
        </a>
      </div>
    </header>
  )
}
