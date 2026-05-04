// App — hash router

function App() {
  const route = window.useHashRoute ? window.useHashRoute() : '/dashboard';

  React.useEffect(() => {
    if (!window.location.hash) window.location.hash = '#/dashboard';
  }, []);

  let screen = null;
  let crumb = [{ label: 'leibniz' }];

  if (route === '/dashboard' || route === '/') {
    screen = <DashboardScreen />;
    crumb = [{ label: 'dashboard' }];
  } else if (route === '/sessions') {
    screen = <SessionsScreen />;
    crumb = [{ label: 'sessions' }];
  } else if (route.startsWith('/sessions/')) {
    const id = route.split('/')[2];
    screen = <SessionDetailScreen id={id} />;
    const sess = window.SESSIONS.find(s => s.id === id || s.short === id);
    crumb = [{ label: 'sessions', href: '/sessions' }, { label: sess ? sess.short : id }];
  } else if (route === '/settings') {
    screen = <SettingsScreen />;
    crumb = [{ label: 'settings' }];
  } else {
    screen = <EmptyState glyph="∅" title="route not found" body={`no screen registered for "${route}".`} path="src/app.jsx" />;
    crumb = [{ label: 'not found' }];
  }

  const liveSession = window.SESSIONS.find(s => s.live);
  const topRight = (
    <>
      {liveSession && (
        <a href={`#/sessions/${liveSession.id}`} className="flex items-center gap-1.5 hover:text-emerald-300 transition-colors font-mono" style={{ color: 'var(--ink-2)' }}>
          <StatusDot kind="emerald" pulse size={5} />
          <span>{liveSession.short}</span>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span style={{ color: 'var(--ink-3)' }}>{liveSession.lastAction}</span>
        </a>
      )}
      <span style={{ color: 'var(--line-2)' }}>·</span>
      <span className="font-mono" style={{ color: 'var(--ink-3)' }}>{window.SESSIONS.length} sessions</span>
    </>
  );

  return (
    <>
      <Rail route={route} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar breadcrumb={crumb} right={topRight} />
        <main className="flex-1 px-7 py-7 max-w-[1280px] w-full mx-auto">
          {screen}
        </main>
        <ShellFooter />
      </div>
    </>
  );
}

// expose useHashRoute since it's defined in primitives
window.useHashRoute = useHashRoute;

function mountApp() {
  document.getElementById('loading')?.remove();
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
}

// If data is already ready (race-condition-safe), mount now; otherwise wait
if (window.__tracebook_ready) {
  mountApp();
} else {
  window.addEventListener('tracebook:ready', mountApp, { once: true });
}
