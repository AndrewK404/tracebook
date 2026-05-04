// Sessions list — readability-focused, with layout variants exposed via Tweaks

const { useState: useStateS, useMemo: useMemoS } = React;

// ─── helpers ─────────────────────────────────────────────────────────────────

function modelShort(m) {
  return m.replace('claude-', '').replace('-4-5', ' 4.5').replace('-4', ' 4');
}

function modelTone(m) {
  if (m.includes('opus')) return '#34d399';
  if (m.includes('sonnet')) return '#7dd3fc';
  if (m.includes('haiku')) return '#a78bfa';
  return 'var(--ink-3)';
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

function CompactRow({ s, density, showModel, showBranch }) {
  const py = density === 'tight' ? 'py-3' : density === 'cozy' ? 'py-4' : 'py-5';
  const cols = `110px 1fr ${showBranch ? '160px' : '130px'} ${showModel ? '110px' : ''} 60px 80px 70px`.replace(/\s+/g, ' ').trim();
  return (
    <li
      onClick={() => window.location.hash = `#/sessions/${s.id}`}
      className={`grid gap-x-4 px-3 ${py} items-center hover-row cursor-pointer transition-colors group`}
      style={{ gridTemplateColumns: cols }}>
      <div className="flex items-center gap-2 font-mono">
        {s.live
          ? <StatusDot kind="emerald" pulse size={5} />
          : <span className="w-[5px] h-[5px] rounded-full" style={{ background: 'var(--ink-4)' }} />}
        <span className="group-hover:text-zinc-50 transition-colors text-[12.5px]" style={{ color: 'var(--ink-2)' }}>{s.short}</span>
      </div>
      <div className="truncate text-[13px] leading-[1.45]" style={{ color: 'var(--ink-1)' }}>{s.preview}</div>
      <div className="t-meta truncate">
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
      <div className="text-right font-mono num text-[12.5px] text-emerald-300">${s.cost.toFixed(2)}</div>
      <div className="text-right t-meta" style={{ color: 'var(--ink-4)' }}>{s.last}</div>
    </li>
  );
}

function CardRow({ s }) {
  return (
    <li
      onClick={() => window.location.hash = `#/sessions/${s.id}`}
      className="surface-1 hover:surface-2 cursor-pointer transition-colors p-4 group">
      {/* top row: id · project · time */}
      <div className="flex items-center gap-3 mb-2.5 text-[11px]">
        <div className="flex items-center gap-1.5 font-mono">
          {s.live
            ? <StatusDot kind="emerald" pulse size={5} />
            : <span className="w-[5px] h-[5px] rounded-full" style={{ background: 'var(--ink-4)' }} />}
          <span className="text-zinc-300">{s.short}</span>
        </div>
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
        {s.live
          ? <span className="flex items-center gap-1.5"><StatusDot kind="emerald" pulse size={5} /> <span style={{ color: '#6ee7b7' }}>live</span></span>
          : <span className="text-zinc-500">{s.short}</span>}
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
          <span className="num text-emerald-300">${s.cost.toFixed(2)}</span>
          <span className="t-meta">{s.last}</span>
        </span>
      </div>
    </li>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

function SessionsScreen() {
  const [filter, setFilter] = useStateS('all');
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

  let rows = window.SESSIONS;
  if (filter === 'live') rows = rows.filter(s => s.live);
  else if (filter === 'today') rows = rows.filter(s => /now|m ago|h ago/.test(s.last));
  else if (filter !== 'all') rows = rows.filter(s => s.project === filter);
  if (q) rows = rows.filter(s =>
    s.preview.toLowerCase().includes(q.toLowerCase())
    || s.id.toLowerCase().includes(q.toLowerCase())
    || s.project.toLowerCase().includes(q.toLowerCase())
  );

  // Top projects ranked by session count
  const projectCounts = {};
  window.SESSIONS.forEach(s => { projectCounts[s.project] = (projectCounts[s.project] || 0) + 1; });
  const projects = Object.entries(projectCounts).sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const liveCount = window.SESSIONS.filter(s => s.live).length;
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
          <button className="btn btn-ghost"><window.Icon.Refresh size={13} /></button>
          <button className="btn btn-neutral"><window.Icon.External size={13} /> open in claude code</button>
        </>}
      />

      {/* Filters bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap pb-4 border-b" style={{ borderColor: 'var(--line-0)' }}>
        <div className="flex items-center gap-2 flex-1 min-w-[260px] surface-2 px-3 py-1.5 rounded-md">
          <window.Icon.Search size={13} className="text-zinc-500" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="search by id, preview, project…"
            className="bg-transparent border-none outline-none text-[13px] text-zinc-100 placeholder-zinc-600 w-full"
          />
          {q && <button onClick={() => setQ('')} className="text-zinc-600 hover:text-zinc-300"><window.Icon.X size={11} /></button>}
        </div>
        <window.Pill active={filter === 'all'} onClick={() => setFilter('all')}>all · {window.SESSIONS.length}</window.Pill>
        <window.Pill active={filter === 'live'} onClick={() => setFilter('live')}>
          <StatusDot kind="emerald" pulse size={5} /> live · {liveCount}
        </window.Pill>
        <window.Pill active={filter === 'today'} onClick={() => setFilter('today')}>today</window.Pill>
        <div className="h-4 w-px" style={{ background: 'var(--line-1)' }} />
        {projectsToShow.map(p => (
          <window.Pill key={p} active={filter === p} onClick={() => setFilter(p)}>
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
        <>
          <div
            className="grid gap-x-4 px-3 pb-2 t-eyebrow border-b"
            style={{
              borderColor: 'var(--line-0)',
              gridTemplateColumns: `120px 1fr ${t.showBranch ? '180px' : '140px'} ${t.showModel ? '110px' : ''} 60px 80px 70px`.replace(/\s+/g,' ').trim()
            }}>
            <span>session</span>
            <span>preview</span>
            <span>{t.showBranch ? 'project · branch' : 'project'}</span>
            {t.showModel && <span>model</span>}
            <span className="text-right">turns</span>
            <span className="text-right">cost</span>
            <span className="text-right">last</span>
          </div>
          <ul className={`divide-y ${t.zebra ? 'sessions-zebra' : ''}`} style={{ borderColor: 'var(--line-0)' }}>
            {rows.map(s => (
              <CompactRow key={s.id} s={s}
                density={t.rowDensity}
                showModel={t.showModel}
                showBranch={t.showBranch} />
            ))}
          </ul>
        </>
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
