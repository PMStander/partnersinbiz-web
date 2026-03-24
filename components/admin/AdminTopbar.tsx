interface AdminTopbarProps {
  userEmail: string
}

export function AdminTopbar({ userEmail }: AdminTopbarProps) {
  return (
    <header className="h-12 flex items-center justify-between px-6 border-b border-outline-variant bg-black shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
          Partners in Biz
        </span>
      </div>
      <div className="flex items-center gap-6">
        <kbd className="hidden md:inline-flex text-[9px] font-label text-on-surface-variant/40 border border-outline-variant px-1.5 py-0.5">
          ⌘K
        </kbd>
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
