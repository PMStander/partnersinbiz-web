interface AdminTopbarProps {
  userEmail: string
  onMenuClick?: () => void
}

export function AdminTopbar({ userEmail, onMenuClick }: AdminTopbarProps) {
  return (
    <header className="h-12 flex items-center justify-between px-4 md:px-6 border-b border-[var(--color-card-border)] bg-black/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-[4px] rounded-lg hover:bg-white/[0.06] transition-colors -ml-1.5"
        >
          <span className="block w-4 h-[1.5px] bg-on-surface-variant" />
          <span className="block w-4 h-[1.5px] bg-on-surface-variant" />
          <span className="block w-4 h-[1.5px] bg-on-surface-variant" />
        </button>
        <span className="text-[11px] font-label uppercase tracking-widest text-on-surface-variant">
          Partners in Biz
        </span>
        <span className="hidden sm:inline w-1 h-1 rounded-full bg-[var(--color-outline-variant)]" />
        <span className="hidden sm:inline text-[11px] font-label text-on-surface-variant/60">
          Admin
        </span>
      </div>
      <div className="flex items-center gap-3 md:gap-5">
        <span className="hidden sm:inline text-[11px] font-label text-on-surface-variant truncate max-w-[180px]">{userEmail}</span>
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
