// Shell: rail + topbar + footer

function Rail({ route }) {
  const isActive = (path) => route === path || (path === '/dashboard' && route === '/');
  const sessionsActive = route === '/sessions' || route.startsWith('/sessions/');
  const about = window._ABOUT || {};
  const port = about.port || 4178;
  const daemon = about.daemon || 'running';
  const uptime = about.uptime || '—';

  return (
    <aside className="w-[232px] flex-shrink-0 flex flex-col border-r" style={{ borderColor: 'var(--line-0)', background: 'var(--bg-1)' }}>
      <div className="px-5 py-5 flex items-center gap-2.5">
        <window.Icon.Logo size={22} />
        <div className="leading-tight">
          <div className="display-tight font-semibold text-[15px] text-zinc-100">tracebook</div>
          <div className="t-meta text-[10px]" style={{ color: 'var(--ink-4)' }}>v0.1.0 · local</div>
        </div>
      </div>

      <div className="px-3 mt-1">
        <div className="t-eyebrow px-3 mb-2" style={{ fontSize: '10px' }}>workspace</div>
        <nav className="space-y-0.5">
          <a href="#/dashboard" className={`rail-link ${isActive('/dashboard') ? 'active' : ''}`}>
            <window.Icon.Dashboard size={15} />
            <span className="flex-1">dashboard</span>
          </a>
          <a href="#/sessions" className={`rail-link ${sessionsActive ? 'active' : ''}`}>
            <window.Icon.Sessions size={15} />
            <span className="flex-1">sessions</span>
            <span className="t-meta num text-[10.5px]" style={{ color: 'var(--ink-4)' }}>{window.SESSIONS.length}</span>
          </a>
          <a href="#/settings" className={`rail-link ${isActive('/settings') ? 'active' : ''}`}>
            <window.Icon.Settings size={15} />
            <span className="flex-1">settings</span>
          </a>
        </nav>
      </div>

      <div className="mt-auto px-5 py-4 space-y-3 border-t" style={{ borderColor: 'var(--line-0)' }}>
        <div className="flex items-center justify-between t-meta">
          <span style={{ color: 'var(--ink-4)' }}>daemon</span>
          <span className="flex items-center gap-1.5 text-emerald-300">
            <StatusDot kind="emerald" pulse size={5} />
            {daemon}
          </span>
        </div>
        <div className="flex items-center justify-between t-meta">
          <span style={{ color: 'var(--ink-4)' }}>port</span>
          <span style={{ color: 'var(--ink-2)' }}>127.0.0.1:{port}</span>
        </div>
        <div className="flex items-center justify-between t-meta">
          <span style={{ color: 'var(--ink-4)' }}>uptime</span>
          <span style={{ color: 'var(--ink-2)' }}>{uptime}</span>
        </div>
      </div>
    </aside>
  );
}
window.Rail = Rail;

function Crumbs({ items }) {
  return (
    <div className="flex items-center gap-2 t-meta">
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: 'var(--ink-4)' }}>/</span>}
          {c.href ? (
            <a href={`#${c.href}`} className="hover:text-zinc-100 transition-colors" style={{ color: 'var(--ink-2)' }}>{c.label}</a>
          ) : (
            <span style={{ color: i === items.length - 1 ? 'var(--ink-1)' : 'var(--ink-3)' }}>{c.label}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
window.Crumbs = Crumbs;

function TopBar({ breadcrumb, right }) {
  return (
    <div className="surface-glass sticky top-0 z-30">
      <div className="h-[52px] px-7 flex items-center justify-between">
        <Crumbs items={breadcrumb} />
        <div className="flex items-center gap-3 text-[12px]">{right}</div>
      </div>
    </div>
  );
}
window.TopBar = TopBar;

function ShellFooter() {
  const about = window._ABOUT || {};
  return (
    <footer className="border-t mt-auto" style={{ borderColor: 'var(--line-0)' }}>
      <div className="px-7 py-3 flex items-center justify-between t-meta" style={{ fontSize: '10.5px', color: 'var(--ink-4)' }}>
        <div className="flex items-center gap-3">
          <span>~/.tracebook/</span>
          <span style={{ color: 'var(--line-2)' }}>·</span>
          <span>~/.claude/projects/</span>
        </div>
        <div className="flex items-center gap-3">
          <span>pid {about.pid || '—'}</span>
          <span style={{ color: 'var(--line-2)' }}>·</span>
          <span>apache 2.0</span>
          <span style={{ color: 'var(--line-2)' }}>·</span>
          <a href="#" className="hover:text-emerald-400 transition-colors">github ↗</a>
        </div>
      </div>
    </footer>
  );
}
window.ShellFooter = ShellFooter;
