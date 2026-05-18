// Sessions list — readability-focused, with layout variants exposed via Tweaks

const { useState: useStateS, useMemo: useMemoS } = React;

// ─── helpers ─────────────────────────────────────────────────────────────────

function modelShort(m) {
  return String(m || '')
    .replace('claude-', '')
    .replace(/-20\d{6,8}$/, '')
    .replace('-4-5', ' 4.5')
    .replace('-4', ' 4');
}

function modelTone(m) {
  if (m.includes('opus')) return '#34d399';
  if (m.includes('sonnet')) return '#7dd3fc';
  if (m.includes('haiku')) return '#a78bfa';
  if (m.includes('codex')) return '#fbbf24';
  if (m.includes('gpt')) return '#fb7185';
  if (m.includes('gemini')) return '#67e8f9';
  return 'var(--ink-3)';
}

function shortPreview(text, limit = 112) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit).trimEnd()}...` : value;
}

function folderLabel(cwd) {
  const value = String(cwd || '').trim();
  if (!value) return 'unknown folder';
  const homeMatch = value.match(/^\/Users\/([^/]+)\/(.+)$/);
  const compact = homeMatch ? `~/${homeMatch[2]}` : value;
  const parts = compact.split('/').filter(Boolean);
  if (compact.length <= 38 || parts.length <= 3) return compact;
  const prefix = compact.startsWith('~/') ? '~' : parts[0];
  return `${prefix}/.../${parts.slice(-2).join('/')}`;
}

function isWaitingSession(s) {
  if (s.waiting) return true;
  const ts = s.startedAt ? new Date(s.startedAt).getTime() : NaN;
  return Number.isFinite(ts) && Date.now() - ts >= 0 && Date.now() - ts < 30 * 60 * 1000;
}

function sessionTokenTotal(s) {
  return (Number(s.tokensIn) || 0)
    + (Number(s.tokensOut) || 0)
    + (Number(s.cacheWrite) || 0)
    + (Number(s.cacheRead) || 0);
}

function sessionTokensLabel(s) {
  const total = sessionTokenTotal(s);
  return window.formatNum ? window.formatNum(total) : total.toLocaleString();
}

function sessionDurationSeconds(s) {
  const start = s?.startedAt ? Date.parse(s.startedAt) : NaN;
  const last = s?.lastAt ? Date.parse(s.lastAt) : NaN;
  const end = s?.live ? Date.now() : last;
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return Math.max(0, (end - start) / 1000);
  }

  let seconds = 0;
  String(s?.duration || '').replace(/(\d+)\s*([dhms])/g, (_, n, unit) => {
    const value = Number(n) || 0;
    seconds += unit === 'd' ? value * 86400
      : unit === 'h' ? value * 3600
      : unit === 'm' ? value * 60
      : value;
    return '';
  });
  return seconds;
}

function topMetricThreshold(rows, valueFor) {
  const values = (rows || [])
    .map(valueFor)
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);
  if (!values.length) return Infinity;
  const topCount = Math.max(1, Math.ceil(values.length * 0.1));
  return values[Math.min(topCount - 1, values.length - 1)];
}

function compactSessionColumns(showModel, showBranch) {
  return `122px minmax(220px, 1fr) ${showBranch ? '170px' : '135px'} ${showModel ? '106px' : ''} 58px 82px 88px 84px 72px`
    .replace(/\s+/g, ' ')
    .trim();
}

const SESSION_PERIODS = [
  { value: 'all', label: 'all' },
  { value: '1', label: 'today' },
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];

function sessionProviderOptions() {
  const values = new Map([['all', { value: 'all', label: 'all providers' }]]);
  (window.SESSIONS || []).forEach(s => values.set(s.provider, { value: s.provider, label: s.provider }));
  (window.PRICING || []).forEach(p => values.set(p.provider, { value: p.provider, label: p.provider }));
  return [...values.values()];
}

function sessionModelOptions(provider) {
  const counts = {};
  (window.SESSIONS || [])
    .filter(s => provider === 'all' || s.provider === provider)
    .forEach(s => { counts[s.model] = (counts[s.model] || 0) + 1; });
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => ({ value: model, label: `${modelShort(model)} · ${count}` }));
  return [{ value: 'all', label: 'all models' }, ...rows];
}

function inPeriod(s, period) {
  if (period === 'all') return true;
  const ts = s.lastAt ? new Date(s.lastAt).getTime() : NaN;
  if (!Number.isFinite(ts)) return false;
  const days = Number(period);
  return Date.now() - ts <= days * 24 * 60 * 60 * 1000;
}

function CopyableSessionId({ s }) {
  const [copied, setCopied] = useStateS(false);
  const text = s.resumeCommand || s.id;
  const copy = async (e) => {
    e.stopPropagation();
    const ok = await window.copyText(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 font-mono group/id"
      title={`copy ${text}`}
    >
      {s.live ? (
        <StatusDot kind="emerald" pulse size={5} />
      ) : isWaitingSession(s) ? (
        <StatusDot kind="amber" pulse size={5} />
      ) : (
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: 'var(--ink-4)' }} />
      )}
      <span className="group-hover/id:text-zinc-50 transition-colors text-[12.5px]" style={{ color: copied ? '#6ee7b7' : 'var(--ink-2)' }}>
        {copied ? 'copied' : s.short}
      </span>
      <window.Icon.Copy size={10} className="opacity-0 group-hover/id:opacity-100 transition-opacity" style={{ color: 'var(--ink-4)' }} />
    </button>
  );
}

// Group sessions by relative day for the timeline variant
function groupByDay(rows) {
  const buckets = { now: [], today: [], yesterday: [], earlier: [] };
  for (const s of rows) {
    if (s.live || s.last === 'now' || s.last === 'just now') buckets.now.push(s);
    else if (/^\d+m ago$|^\d+h ago$/.test(s.last)) buckets.today.push(s);
    else if (s.last === '1d ago') buckets.yesterday.push(s);
    else buckets.earlier.push(s);
  }
  return buckets;
}

// Group sessions by project for the project-groups variant
function groupByProject(rows) {
  const map = new Map();
  for (const s of rows) {
    if (!map.has(s.project)) map.set(s.project, []);
    map.get(s.project).push(s);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

// ─── shared row renderers ────────────────────────────────────────────────────

function CompactRow({ s, density, showModel, showBranch, topDurationThreshold = Infinity, topCostThreshold = Infinity }) {
  const py = density === 'tight' ? 'py-3' : density === 'cozy' ? 'py-4' : 'py-5';
  const cols = compactSessionColumns(showModel, showBranch);
  const durationSeconds = sessionDurationSeconds(s);
  const topDuration = durationSeconds > 0 && durationSeconds >= topDurationThreshold;
  const topCost = Number(s.cost || 0) > 0 && Number(s.cost || 0) >= topCostThreshold;
  return (
    <li
      onClick={() => window.location.hash = `#/sessions/${s.id}`}
      className={`session-table-row grid gap-x-4 px-4 ${py} items-center hover-row cursor-pointer transition-colors group`}
      style={{ gridTemplateColumns: cols }}>
      <CopyableSessionId s={s} />
      <div className="session-preview-cell" title={`${s.preview || ''}\n${s.cwd || ''}`}>
        <span className="session-row-preview-text">{shortPreview(s.preview, 82)}</span>
        <span className="session-row-folder">{folderLabel(s.cwd)}</span>
      </div>
      <div className="session-project-cell t-meta truncate">
        <span style={{ color: 'var(--ink-3)' }}>{s.project}</span>
        {showBranch && <span style={{ color: 'var(--ink-4)' }}> · {s.branch}</span>}
      </div>
      {showModel && (
        <div className="font-mono text-[11.5px] truncate flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: modelTone(s.model) }} />
          <span style={{ color: 'var(--ink-3)' }}>{modelShort(s.model)}</span>
        </div>
      )}
      <div className="text-right font-mono num text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{s.turns}</div>
      <div
        className={`text-right font-mono num text-[12.5px] session-duration-value ${topDuration ? 'session-metric-hot' : ''}`}
        title={topDuration ? `Top 10% by duration; threshold ${formatDurationThreshold(topDurationThreshold)}.` : undefined}>
        {s.duration || '—'}
      </div>
      <div className="text-right font-mono num text-[12.5px] session-token-value">{sessionTokensLabel(s)}</div>
      <div
        className={`text-right font-mono num text-[12.5px] session-cost-value ${topCost ? 'session-metric-hot' : ''}`}
        title={topCost ? `Top 10% by estimated cost; threshold $${topCostThreshold.toFixed(2)}.` : undefined}>
        ${s.cost.toFixed(2)}
      </div>
      <div className="text-right t-meta" style={{ color: 'var(--ink-4)' }}>{s.last}</div>
    </li>
  );
}

function SessionsCompactTable({ rows, density = 'cozy', showModel = true, showBranch = true, zebra = false, limit }) {
  const visibleRows = limit ? rows.slice(0, limit) : rows;
  const thresholdRows = window.SESSIONS || visibleRows;
  const durationThreshold = topMetricThreshold(thresholdRows, sessionDurationSeconds);
  const costThreshold = topMetricThreshold(thresholdRows, s => Number(s.cost) || 0);
  return (
    <div className="session-table-panel">
      <div
        className="session-table-head grid gap-x-4 px-4 py-3 t-eyebrow border-b"
        style={{
          borderColor: 'var(--line-0)',
          gridTemplateColumns: compactSessionColumns(showModel, showBranch),
        }}>
        <span>session</span>
        <span>preview</span>
        <span>{showBranch ? 'project · branch' : 'project'}</span>
        {showModel && <span>model</span>}
        <span className="text-right">turns</span>
        <span className="text-right">time</span>
        <span className="text-right">tokens</span>
        <span className="text-right">cost</span>
        <span className="text-right">last</span>
      </div>
      <ul className={`session-table-body divide-y ${zebra ? 'sessions-zebra' : ''}`} style={{ borderColor: 'var(--line-0)' }}>
        {visibleRows.map(s => (
          <CompactRow key={s.id} s={s}
            density={density}
            showModel={showModel}
            showBranch={showBranch}
            topDurationThreshold={durationThreshold}
            topCostThreshold={costThreshold} />
        ))}
      </ul>
    </div>
  );
}
window.SessionsCompactTable = SessionsCompactTable;

function formatDurationThreshold(seconds) {
  if (!Number.isFinite(seconds)) return 'n/a';
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  if (whole < 3600) return `${Math.floor(whole / 60)}m`;
  return `${Math.floor(whole / 3600)}h ${Math.floor((whole % 3600) / 60)}m`;
}

function CardRow({ s }) {
  return (
    <li
      onClick={() => window.location.hash = `#/sessions/${s.id}`}
      className="surface-1 hover:surface-2 cursor-pointer transition-colors p-4 group">
      {/* top row: id · project · time */}
      <div className="flex items-center gap-3 mb-2.5 text-[11px]">
        <CopyableSessionId s={s} />
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span className="font-mono text-zinc-400 truncate">{s.project}</span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span className="t-meta">{s.branch}</span>
        <span className="ml-auto t-meta">{s.last}</span>
      </div>
      {/* preview, the main thing */}
      <div className="text-[14px] leading-[1.5] mb-3 group-hover:text-zinc-50 transition-colors" style={{ color: 'var(--ink-1)' }}>
        {s.preview}
      </div>
      {/* footer metrics */}
      <div className="flex items-center gap-4 text-[11px] font-mono">
          <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: modelTone(s.model) }} />
          <span style={{ color: 'var(--ink-3)' }}>{modelShort(s.model)}</span>
        </span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span style={{ color: 'var(--ink-3)' }}><span className="num text-zinc-200">{s.turns}</span> turns</span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span style={{ color: 'var(--ink-3)' }}><span className="num text-zinc-200">{s.duration || '—'}</span> work</span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span style={{ color: 'var(--ink-3)' }}><span className="num text-zinc-200">{sessionTokensLabel(s)}</span> tokens</span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span className="num text-emerald-300">${s.cost.toFixed(2)}</span>
        <span className="ml-auto t-meta opacity-0 group-hover:opacity-100 transition-opacity">open →</span>
      </div>
    </li>
  );
}

// stacked, prose-like — biggest preview, tiny meta
function StackedRow({ s }) {
  return (
    <li
      onClick={() => window.location.hash = `#/sessions/${s.id}`}
      className="cursor-pointer hover-row group px-4 py-4 -mx-4 transition-colors">
      <div className="text-[14.5px] leading-[1.5] text-zinc-100 group-hover:text-white mb-1.5">
        {s.preview}
      </div>
      <div className="flex items-center gap-2 text-[11px] font-mono flex-wrap" style={{ color: 'var(--ink-3)' }}>
        <CopyableSessionId s={s} />
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span className="text-zinc-300">{s.project}</span>
        <span style={{ color: 'var(--ink-4)' }}>/</span>
        <span style={{ color: 'var(--ink-4)' }}>{s.branch}</span>
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: modelTone(s.model) }} />
          {modelShort(s.model)}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span><span className="num text-zinc-200">{s.turns}</span> turns</span>
          <span><span className="num text-zinc-200">{s.duration || '—'}</span> work</span>
          <span><span className="num text-zinc-200">{sessionTokensLabel(s)}</span> tokens</span>
          <span className="num text-emerald-300">${s.cost.toFixed(2)}</span>
          <span className="t-meta">{s.last}</span>
        </span>
      </div>
    </li>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

function SessionsScreen() {
  const [rev, setRev] = useStateS(0);
  const [statusFilter, setStatusFilter] = useStateS('all');
  const [projectFilter, setProjectFilter] = useStateS('all');
  const [provider, setProvider] = useStateS('all');
  const [model, setModel] = useStateS('all');
  const [period, setPeriod] = useStateS('all');
  const [q, setQ] = useStateS('');

  const tweaks = window.useTweaks ? window.useTweaks({
    sessionLayout: 'compact',  // 'compact' | 'cards' | 'stacked' | 'projects' | 'timeline'
    rowDensity: 'cozy',        // 'tight' | 'cozy' | 'comfortable'
    showModel: true,
    showBranch: true,
    zebra: false,
  }) : [{
    sessionLayout: 'compact', rowDensity: 'cozy', showModel: true, showBranch: true, zebra: false,
  }, () => {}];
  const [t, setTweak] = tweaks;

  React.useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (!window.fetchSessions) return;
      await window.fetchSessions();
      if (!cancelled) setRev(r => r + 1);
    };
    const onReady = () => setRev(r => r + 1);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener('tracebook:sessions-ready', onReady);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('tracebook:sessions-ready', onReady);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  React.useEffect(() => {
    const values = sessionModelOptions(provider).map(o => o.value);
    if (!values.includes(model)) setModel('all');
  }, [provider]);

  let rows = window.SESSIONS || [];
  if (provider !== 'all') rows = rows.filter(s => s.provider === provider);
  if (model !== 'all') rows = rows.filter(s => String(s.model || '').toLowerCase().includes(model.toLowerCase()));
  rows = rows.filter(s => inPeriod(s, period));
  if (statusFilter === 'live') rows = rows.filter(s => s.live);
  if (statusFilter === 'waiting') rows = rows.filter(s => isWaitingSession(s));
  if (projectFilter !== 'all') rows = rows.filter(s => s.project === projectFilter);
  if (q) rows = rows.filter(s =>
    s.preview.toLowerCase().includes(q.toLowerCase())
    || s.id.toLowerCase().includes(q.toLowerCase())
    || s.project.toLowerCase().includes(q.toLowerCase())
    || String(s.cwd || '').toLowerCase().includes(q.toLowerCase())
  );

  // Top projects ranked by session count
  const projectCounts = {};
  window.SESSIONS.forEach(s => { projectCounts[s.project] = (projectCounts[s.project] || 0) + 1; });
  const projects = Object.entries(projectCounts).sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const liveCount = window.SESSIONS.filter(s => s.live).length;
  const waitingCount = window.SESSIONS.filter(isWaitingSession).length;
  const [showAllProjects, setShowAllProjects] = useStateS(false);
  const projectsToShow = showAllProjects ? projects : projects.slice(0, 6);

  const layoutLabel = {
    compact: '01 / table · dense',
    cards:   '02 / cards · breathable',
    stacked: '03 / prose · preview-first',
    projects:'04 / grouped by project',
    timeline:'05 / grouped by day',
  }[t.sessionLayout] || '';

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="sessions"
        title="sessions"
        subtitle="every claude code conversation, replayable from disk. click any row for the full trace."
        right={<>
          <button className="btn btn-ghost" onClick={() => window.fetchSessions?.().then(() => setRev(r => r + 1))}>
            <window.Icon.Refresh size={13} /> refresh
          </button>
          <button className="btn btn-neutral"><window.Icon.External size={13} /> open in claude code</button>
        </>}
      />

      {/* Filters bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap pb-4 border-b" style={{ borderColor: 'var(--line-0)' }}>
        <div className="flex items-center gap-2 flex-1 min-w-[260px] surface-2 px-3 py-1.5 rounded-md">
          <window.Icon.Search size={13} className="text-zinc-500" />
          <input
            id="session-search"
            name="session-search"
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="search by id, preview, project…"
            className="bg-transparent border-none outline-none text-[13px] text-zinc-100 placeholder-zinc-600 w-full"
          />
          {q && <button onClick={() => setQ('')} className="text-zinc-600 hover:text-zinc-300"><window.Icon.X size={11} /></button>}
        </div>
        <window.Select label="provider" value={provider} onChange={setProvider} options={sessionProviderOptions()} />
        <window.Select label="model" value={model} onChange={setModel} options={sessionModelOptions(provider)} />
        <window.Pill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>all · {window.SESSIONS.length}</window.Pill>
        <window.Pill active={statusFilter === 'live'} onClick={() => setStatusFilter('live')}>
          <StatusDot kind="emerald" pulse size={5} /> live · {liveCount}
        </window.Pill>
        <window.Pill active={statusFilter === 'waiting'} onClick={() => setStatusFilter('waiting')}>
          <StatusDot kind="amber" pulse size={5} /> waiting · {waitingCount}
        </window.Pill>
        <div className="h-4 w-px" style={{ background: 'var(--line-1)' }} />
        {SESSION_PERIODS.map(p => (
          <window.Pill key={p.value} active={period === p.value} onClick={() => setPeriod(p.value)}>{p.label}</window.Pill>
        ))}
        <div className="h-4 w-px" style={{ background: 'var(--line-1)' }} />
        {projectsToShow.map(p => (
          <window.Pill key={p} active={projectFilter === p} onClick={() => setProjectFilter(projectFilter === p ? 'all' : p)}>
            {p} <span style={{ color: 'var(--ink-4)', marginLeft: 4 }}>{projectCounts[p]}</span>
          </window.Pill>
        ))}
        {projects.length > 6 && (
          <button
            onClick={() => setShowAllProjects(v => !v)}
            className="text-[11.5px] font-mono px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--ink-3)' }}
          >
            {showAllProjects ? '− collapse' : `+ ${projects.length - 6} more`}
          </button>
        )}
      </div>

      {/* Layout banner — hint for variant currently shown */}
      <div className="flex items-center justify-between mb-3 t-eyebrow">
        <span>{layoutLabel}</span>
        <span style={{ color: 'var(--ink-4)' }}>{rows.length} of {window.SESSIONS.length}</span>
      </div>

      {/* — compact table — */}
      {t.sessionLayout === 'compact' && (
        <SessionsCompactTable
          rows={rows}
          density={t.rowDensity}
          showModel={t.showModel}
          showBranch={t.showBranch}
          zebra={t.zebra}
        />
      )}

      {/* — cards grid — */}
      {t.sessionLayout === 'cards' && (
        <ul className="grid grid-cols-2 gap-3">
          {rows.map(s => <CardRow key={s.id} s={s} />)}
        </ul>
      )}

      {/* — prose / stacked — */}
      {t.sessionLayout === 'stacked' && (
        <ul className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
          {rows.map(s => <StackedRow key={s.id} s={s} />)}
        </ul>
      )}

      {/* — grouped by project — */}
      {t.sessionLayout === 'projects' && (
        <div className="space-y-7">
          {groupByProject(rows).map(([proj, list]) => (
            <div key={proj}>
              <div className="flex items-center gap-3 mb-2">
                <span className="t-eyebrow">{proj}</span>
                <span className="flex-1 h-px" style={{ background: 'var(--line-0)' }} />
                <span className="t-meta num">{list.length}</span>
                <span className="t-meta num text-emerald-300">${list.reduce((a,s)=>a+s.cost,0).toFixed(2)}</span>
              </div>
              <ul className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
                {list.map(s => <StackedRow key={s.id} s={s} />)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* — grouped by time — */}
      {t.sessionLayout === 'timeline' && (
        <div className="space-y-7">
          {Object.entries(groupByDay(rows)).map(([bucket, list]) => list.length > 0 && (
            <div key={bucket}>
              <div className="flex items-center gap-3 mb-2">
                <span className="t-eyebrow">
                  {bucket === 'now' ? '● live' : bucket === 'today' ? 'today' : bucket === 'yesterday' ? 'yesterday' : 'earlier'}
                </span>
                <span className="flex-1 h-px" style={{ background: 'var(--line-0)' }} />
                <span className="t-meta num">{list.length}</span>
              </div>
              <ul className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
                {list.map(s => <StackedRow key={s.id} s={s} />)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 && (
        <div className="p-12 text-center t-small">no sessions match.</div>
      )}

      <div className="mt-6 pt-4 border-t flex items-center justify-between t-meta" style={{ borderColor: 'var(--line-0)', fontSize: '10.5px' }}>
        <span>{rows.length} of {window.SESSIONS.length} sessions</span>
        <span>~/.claude/projects/</span>
      </div>

      {/* Tweaks panel — only renders when host activates it */}
      {window.TweaksPanel && (
        <window.TweaksPanel title="sessions · tweaks">
          <window.TweakSection title="layout">
            <window.TweakSelect
              label="variant"
              value={t.sessionLayout}
              onChange={v => setTweak('sessionLayout', v)}
              options={[
                { value: 'compact',  label: 'compact table' },
                { value: 'cards',    label: 'cards grid' },
                { value: 'stacked',  label: 'prose / stacked' },
                { value: 'projects', label: 'grouped · project' },
                { value: 'timeline', label: 'grouped · time' },
              ]}
            />
            {t.sessionLayout === 'compact' && (
              <>
                <window.TweakRadio
                  label="row density"
                  value={t.rowDensity}
                  onChange={v => setTweak('rowDensity', v)}
                  options={[
                    { value: 'tight', label: 'tight' },
                    { value: 'cozy', label: 'cozy' },
                    { value: 'comfortable', label: 'comfy' },
                  ]}
                />
                <window.TweakToggle label="zebra rows" value={t.zebra} onChange={v => setTweak('zebra', v)} />
                <window.TweakToggle label="show model column" value={t.showModel} onChange={v => setTweak('showModel', v)} />
                <window.TweakToggle label="show branch" value={t.showBranch} onChange={v => setTweak('showBranch', v)} />
              </>
            )}
          </window.TweakSection>
        </window.TweaksPanel>
      )}
    </div>
  );
}
window.SessionsScreen = SessionsScreen;
