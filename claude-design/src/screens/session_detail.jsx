// Session detail: context window panel + trace waterfall + inspector

const { useState: useStateSD } = React;

// ─── Donut for context budget ────────────────────────────────────────────────

function ContextDonut({ used, max, categories }) {
  const r = 64, c = 2 * Math.PI * r;
  const usedPct = used / max;
  let acc = 0;
  const segs = categories.map((cat) => {
    const start = acc;
    const portion = cat.tokens / max;
    acc += portion;
    return { ...cat, start, portion };
  });
  return (
    <svg width="170" height="170" viewBox="0 0 170 170">
      <circle cx="85" cy="85" r={r} fill="none" stroke="var(--bg-0)" strokeWidth="14" />
      {segs.map((s, i) => (
        <circle key={i} cx="85" cy="85" r={r} fill="none" stroke={s.color} strokeWidth="14"
          strokeDasharray={`${s.portion * c} ${c}`} strokeDashoffset={-s.start * c}
          transform="rotate(-90 85 85)" strokeLinecap="butt" />
      ))}
      <text x="85" y="80" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9.5" fill="var(--ink-3)">used</text>
      <text x="85" y="98" textAnchor="middle" fontFamily="Inter Tight" fontWeight="600" fontSize="22" letterSpacing="-0.02em" fill="#f4f4f5">{Math.round(usedPct * 100)}%</text>
      <text x="85" y="113" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--ink-4)">{(used/1000).toFixed(1)}k / {(max/1e6).toFixed(0)}M</text>
    </svg>
  );
}

function ContextPanel({ sessionId }) {
  const ctx = window.CONTEXT_BUDGET;
  const free = ctx.contextMax - ctx.contextUsed;
  const cats = [...ctx.categories, { key: 'free', label: 'free', tokens: free, color: '#27272a', glyph: 'database' }];

  return (
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-4">
        <Eyebrow num={1} label="context budget" meta={ctx.model} />
        <Card padding="p-5">
          <div className="flex items-center justify-center mb-4">
            <ContextDonut used={ctx.contextUsed} max={ctx.contextMax} categories={ctx.categories} />
          </div>
          <div className="space-y-1.5 text-[11.5px] font-mono">
            {cats.map(cat => (
              <div key={cat.key} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: cat.color }} />
                <span className="flex-1 text-zinc-300">{cat.label}</span>
                <span className="num text-zinc-200">{(cat.tokens/1000).toFixed(1)}k</span>
                <span className="num w-12 text-right" style={{ color: 'var(--ink-4)' }}>{((cat.tokens/ctx.contextMax)*100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="col-span-8 space-y-5">
        <div>
          <Eyebrow num={2} label="what's in context" meta="categorized prompt composition" />
          <div className="grid grid-cols-2 gap-3">
            <ContextGroup title="custom agents" tone="violet" items={window.CONTEXT_ITEMS.agents} icon="Brain" />
            <ContextGroup title="skills" tone="rose" items={window.CONTEXT_ITEMS.skills} icon="Sparkles" />
            <ContextGroup title="mcp servers" tone="cyan" items={window.CONTEXT_ITEMS.mcp} icon="Plug" />
            <ContextGroup title="memory files" tone="amber" items={window.CONTEXT_ITEMS.memory} icon="File" />
          </div>
        </div>

        <div>
          <Eyebrow num={3} label="system tools" meta={`${window.CONTEXT_ITEMS.systemTools.length} loaded`} />
          <Card padding="p-3">
            <div className="grid grid-cols-3 gap-1.5">
              {window.CONTEXT_ITEMS.systemTools.map(t => (
                <div key={t.name} className="flex items-center gap-2 px-2.5 py-1.5 rounded surface-2">
                  <window.Icon.Tool size={12} className="text-zinc-500" />
                  <span className="font-mono text-[12px] text-zinc-200 flex-1">{t.name}</span>
                  <span className="font-mono num text-[10.5px]" style={{ color: 'var(--ink-4)' }}>{(t.tokens/1000).toFixed(1)}k</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ContextGroup({ title, items, tone, icon }) {
  const IconC = window.Icon[icon];
  return (
    <div className="surface-2 p-3.5">
      <div className="flex items-center gap-2 mb-3">
        <IconC size={13} className={`text-${tone === 'violet' ? 'violet' : tone === 'rose' ? 'rose' : tone === 'cyan' ? 'cyan' : 'amber'}-300`} />
        <span className="t-eyebrow">{title}</span>
        <span className="ml-auto t-meta" style={{ fontSize: '10.5px' }}>{items.length}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map(it => (
          <li key={it.name} className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-mono text-zinc-200 truncate">{it.name}</span>
            <span className="font-mono num text-[10.5px]" style={{ color: 'var(--ink-4)' }}>{(it.tokens/1000).toFixed(1)}k</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Trace tree (left) ───────────────────────────────────────────────────────

const NODE_META = {
  assistant: { color: '#34d399', bg: 'rgba(52,211,153,0.10)', label: 'assistant', glyph: 'Cpu' },
  llm:       { color: '#7dd3fc', bg: 'rgba(125,211,252,0.10)', label: 'llm',       glyph: 'Sparkles' },
  tool:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', label: 'tool',      glyph: 'Tool' },
  skill:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', label: 'skill',      glyph: 'Sparkles' },
  mcp:       { color: '#67e8f9', bg: 'rgba(103,232,249,0.10)', label: 'mcp',       glyph: 'Plug' },
};

function NodeBadge({ type }) {
  const m = NODE_META[type];
  return <span className="font-mono text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}33` }}>{m.label}</span>;
}

function TraceTree({ nodes, selected, onSelect }) {
  return (
    <div className="space-y-px">
      {nodes.map(n => {
        const m = NODE_META[n.type];
        const Icn = window.Icon[m.glyph];
        return (
          <div key={n.id}
            onClick={() => onSelect(n.id)}
            className={`trace-row ${selected === n.id ? 'selected' : ''} flex items-center gap-2.5 py-1.5 pr-3 rounded`}
            style={{
              paddingLeft: 8 + n.depth * 16,
              borderLeft: `2px solid ${selected === n.id ? m.color : 'transparent'}`,
            }}
          >
            <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: m.bg, color: m.color }}>
              <Icn size={10} />
            </span>
            <span className="font-mono text-[12px] text-zinc-100 flex-1 truncate">{n.name}</span>
            {n.live && <span className="text-[10px] font-mono px-1.5 rounded text-emerald-300" style={{ background: 'rgba(52,211,153,0.10)' }}><span className="inline-block w-1 h-1 rounded-full bg-emerald-400 mr-1 align-middle" />live</span>}
            <span className="font-mono num text-[10.5px] flex-shrink-0" style={{ color: 'var(--ink-4)' }}>{(n.duration/1000).toFixed(2)}s</span>
            <span className="font-mono num text-[10.5px] flex-shrink-0 text-right w-14" style={{ color: 'var(--ink-3)' }}>{n.tokens.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Waterfall view ──────────────────────────────────────────────────────────

function Waterfall({ nodes, total, selected, onSelect }) {
  const ROW_H = 28;
  const W = 720;
  const labelW = 240;
  const innerW = W - labelW - 12;
  return (
    <div className="surface-2 p-3 overflow-x-auto">
      <div className="relative" style={{ minWidth: W, height: nodes.length * ROW_H + 24 }}>
        {/* time grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <div key={i}>
            <div className="absolute top-0 bottom-0 w-px" style={{ left: labelW + p * innerW, background: 'var(--line-0)' }} />
            <div className="absolute font-mono text-[9.5px]" style={{ left: labelW + p * innerW + 4, top: -2, color: 'var(--ink-4)' }}>
              {(total * p / 1000).toFixed(1)}s
            </div>
          </div>
        ))}
        {nodes.map((n, i) => {
          const m = NODE_META[n.type];
          const Icn = window.Icon[m.glyph];
          const x = labelW + (n.start / total) * innerW;
          const w = Math.max(2, (n.duration / total) * innerW);
          return (
            <div key={n.id}
              onClick={() => onSelect(n.id)}
              className={`absolute trace-row ${selected === n.id ? 'selected' : ''} flex items-center rounded-sm cursor-pointer`}
              style={{ top: 14 + i * ROW_H, left: 0, right: 0, height: ROW_H - 4 }}
            >
              <div className="flex items-center gap-2 pr-2 truncate" style={{ width: labelW, paddingLeft: 8 + n.depth * 14 }}>
                <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: m.bg, color: m.color }}>
                  <Icn size={9} />
                </span>
                <span className="font-mono text-[11.5px] text-zinc-200 truncate">{n.name}</span>
              </div>
              <div className="absolute h-[18px] rounded-sm" style={{
                left: x, width: w, top: 5,
                background: m.bg,
                borderLeft: `2px solid ${m.color}`,
                boxShadow: n.live ? `0 0 8px ${m.color}66` : 'none',
              }}>
                {w > 60 && (
                  <span className="font-mono text-[9.5px] absolute left-2 top-[3px]" style={{ color: m.color }}>
                    {n.tokens > 0 ? `${n.tokens.toLocaleString()} tok` : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── JSON pretty viewer ──────────────────────────────────────────────────────

function jsonHighlight(obj, depth = 0) {
  const indent = '  '.repeat(depth);
  const indentInner = '  '.repeat(depth + 1);
  if (obj === null) return <span className="json-null">null</span>;
  if (typeof obj === 'string') return <span className="json-string">"{obj}"</span>;
  if (typeof obj === 'number') return <span className="json-number">{obj}</span>;
  if (typeof obj === 'boolean') return <span className="json-bool">{String(obj)}</span>;
  if (Array.isArray(obj)) {
    if (!obj.length) return <span className="json-bracket">[]</span>;
    return (<>
      <span className="json-bracket">[</span>
      {obj.map((v, i) => (
        <div key={i}>{indentInner}{jsonHighlight(v, depth + 1)}{i < obj.length - 1 ? <span className="json-bracket">,</span> : ''}</div>
      ))}
      <div>{indent}<span className="json-bracket">]</span></div>
    </>);
  }
  const keys = Object.keys(obj);
  if (!keys.length) return <span className="json-bracket">{'{}'}</span>;
  return (<>
    <span className="json-bracket">{'{'}</span>
    {keys.map((k, i) => (
      <div key={k}>{indentInner}<span className="json-key">"{k}"</span><span className="json-bracket">: </span>{jsonHighlight(obj[k], depth + 1)}{i < keys.length - 1 ? <span className="json-bracket">,</span> : ''}</div>
    ))}
    <div>{indent}<span className="json-bracket">{'}'}</span></div>
  </>);
}

// ─── Inspector ───────────────────────────────────────────────────────────────

function Inspector({ nodeId }) {
  const node = window.TRACE.nodes.find(n => n.id === nodeId);
  const [tab, setTab] = useStateSD('input');
  if (!node) return null;
  const detail = window.NODE_DETAIL[nodeId];
  const m = NODE_META[node.type];
  const Icn = window.Icon[m.glyph];

  return (
    <div className="surface-1 flex flex-col h-full">
      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--line-0)' }}>
        <span className="w-6 h-6 rounded flex items-center justify-center" style={{ background: m.bg, color: m.color }}>
          <Icn size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <NodeBadge type={node.type} />
            <span className="font-mono text-[12px] text-zinc-100 truncate">{node.name}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 t-meta" style={{ fontSize: '10.5px' }}>
            <span><window.Icon.Clock size={9} className="inline -mt-px mr-1" />{(node.duration/1000).toFixed(2)}s</span>
            <span>{node.tokens.toLocaleString()} tokens</span>
            {node.cost > 0 && <span className="text-emerald-300">${node.cost.toFixed(4)}</span>}
            <span className="ml-auto" style={{ color: 'var(--ink-4)' }}>id {node.id}</span>
          </div>
        </div>
      </div>

      <div className="px-4 border-b flex items-center gap-0" style={{ borderColor: 'var(--line-0)' }}>
        {['input', 'output', 'attributes', 'raw'].map(t => (
          <button key={t} className={`tabline ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-ghost"><window.Icon.Copy size={11} /></button>
          <button className="btn btn-ghost"><window.Icon.Maximize size={11} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-[1.7]" style={{ background: 'var(--bg-0)' }}>
        {detail ? (
          tab === 'raw'
            ? <pre className="whitespace-pre-wrap text-zinc-300">{JSON.stringify({ input: detail.input, output: detail.output, attributes: detail.attributes }, null, 2)}</pre>
            : <pre className="whitespace-pre">{jsonHighlight(detail[tab] || {})}</pre>
        ) : (
          <div className="text-center pt-12 text-[12px]" style={{ color: 'var(--ink-4)' }}>
            <div className="mb-2 text-[24px]">∅</div>
            no captured payload for this node.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Run metadata sidebar ────────────────────────────────────────────────────

function RunMeta({ session }) {
  return (
    <div className="space-y-4">
      <div className="surface-2 p-4">
        <div className="t-eyebrow mb-3">status</div>
        <div className="flex items-center gap-2">
          <StatusDot kind={session.status === 'running' ? 'emerald' : 'zinc'} pulse={session.status === 'running'} size={6} />
          <span className="font-mono text-[13px] text-zinc-100">{session.status}</span>
        </div>
        <div className="mt-3 t-meta" style={{ fontSize: '10.5px' }}>started {session.started} · {session.duration}</div>
      </div>

      <div className="surface-2 p-4 space-y-3">
        <div>
          <div className="t-eyebrow mb-1.5">cwd</div>
          <div className="font-mono text-[12px] text-zinc-100">{session.cwd}</div>
          <div className="t-meta mt-0.5" style={{ fontSize: '10.5px' }}>{session.branch}</div>
        </div>
        <div className="border-t pt-3" style={{ borderColor: 'var(--line-0)' }}>
          <div className="t-eyebrow mb-1.5">model</div>
          <div className="font-mono text-[12px] text-zinc-100">{session.model}</div>
          <div className="t-meta mt-0.5" style={{ fontSize: '10.5px' }}>provider · {session.provider}</div>
        </div>
      </div>

      <div className="surface-2 p-4">
        <div className="t-eyebrow mb-3">tokens</div>
        <div className="space-y-1.5 text-[12px] font-mono">
          <div className="flex justify-between"><span style={{ color: 'var(--ink-3)' }}>in</span><span className="num text-zinc-200">{(session.tokensIn || 0).toLocaleString()}</span></div>
          <div className="flex justify-between"><span style={{ color: 'var(--ink-3)' }}>out</span><span className="num text-zinc-200">{(session.tokensOut || 0).toLocaleString()}</span></div>
          <div className="flex justify-between"><span style={{ color: 'var(--ink-3)' }}>cache write</span><span className="num text-zinc-200">{(session.cacheWrite || 0).toLocaleString()}</span></div>
          <div className="flex justify-between"><span style={{ color: 'var(--ink-3)' }}>cache read</span><span className="num text-emerald-300">{(session.cacheRead || 0).toLocaleString()}</span></div>
        </div>
        <div className="border-t mt-3 pt-3 flex items-center justify-between" style={{ borderColor: 'var(--line-0)' }}>
          <span className="t-eyebrow">cost</span>
          <span className="display-tight font-semibold text-[16px] text-emerald-300 num">${session.cost.toFixed(2)}</span>
        </div>
      </div>

      <div className="surface-2 p-4">
        <div className="t-eyebrow mb-3">tools used</div>
        <ul className="space-y-1.5 text-[12px] font-mono">
          {[['Read', 12], ['Bash', 8], ['Edit', 4], ['Grep', 3], ['MCP·memory', 2]].map(([n, c]) => (
            <li key={n} className="flex justify-between"><span className="text-zinc-200">{n}</span><span className="num" style={{ color: 'var(--ink-3)' }}>{c}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── SessionDetailScreen ─────────────────────────────────────────────────────

function SessionDetailScreen({ id }) {
  const session = window.SESSIONS.find(s => s.id === id || s.short === id);
  const [tab, setTab] = useStateSD('trace');
  const [traceMode, setTraceMode] = useStateSD('tree');
  const [selected, setSelected] = useStateSD('l2');

  if (!session) return <EmptyState glyph="∅" title="session not found" body={`no session matches "${id}".`} path={`~/.claude/projects/<project>/${id}.jsonl`} />;

  const tabs = [
    { key: 'trace', label: 'trace' },
    { key: 'context', label: 'context window' },
    { key: 'transcript', label: 'transcript' },
  ];

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow={`sessions / ${session.short}`}
        title={session.preview}
        subtitle={<span className="font-mono">{session.id}</span>}
        right={<>
          {session.live && (
            <span className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[11.5px] font-mono"
                  style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)', color: '#6ee7b7' }}>
              <StatusDot kind="emerald" pulse size={5} /> live · /events?session={session.short}
            </span>
          )}
          <button className="btn btn-ghost"><window.Icon.Copy size={13} /></button>
          <button className="btn btn-neutral"><window.Icon.External size={13} /> open jsonl</button>
        </>}
      />

      <div className="border-b mb-6 flex items-center gap-0" style={{ borderColor: 'var(--line-0)' }}>
        {tabs.map(t => (
          <button key={t.key} className={`tabline ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-2">
          {tab === 'trace' && (
            <div className="flex items-center gap-1 surface-2 p-0.5 rounded">
              <button className={`btn btn-ghost ${traceMode === 'tree' ? 'active' : ''}`} onClick={() => setTraceMode('tree')}>tree</button>
              <button className={`btn btn-ghost ${traceMode === 'waterfall' ? 'active' : ''}`} onClick={() => setTraceMode('waterfall')}>waterfall</button>
            </div>
          )}
        </div>
      </div>

      {tab === 'context' && <ContextPanel sessionId={id} />}

      {tab === 'trace' && (
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-3">
            <RunMeta session={session} />
          </div>
          <div className="col-span-5">
            <Eyebrow num={1} label={traceMode === 'tree' ? 'call tree' : 'waterfall'} meta={`${window.TRACE.nodes.length} nodes · ${(window.TRACE.totalDuration/1000).toFixed(2)}s · ${window.TRACE.totalTokens.toLocaleString()} tokens`} />
            {traceMode === 'tree' ? (
              <Card padding="p-2">
                <TraceTree nodes={window.TRACE.nodes} selected={selected} onSelect={setSelected} />
              </Card>
            ) : (
              <Waterfall nodes={window.TRACE.nodes} total={window.TRACE.totalDuration} selected={selected} onSelect={setSelected} />
            )}
          </div>
          <div className="col-span-4" style={{ minHeight: 540 }}>
            <Eyebrow num={2} label="inspector" meta="payload of the selected node" />
            <Inspector nodeId={selected} />
          </div>
        </div>
      )}

      {tab === 'transcript' && (
        <Card padding="p-6">
          <div className="space-y-5 font-mono text-[12.5px]">
            <div>
              <div className="chip chip-emerald mb-1.5">user</div>
              <p className="text-zinc-200 leading-relaxed">refactor the policy resolver to use last-match-wins ordering. keep the rule format the same.</p>
            </div>
            <div>
              <div className="chip mb-1.5" style={{ background: 'rgba(52,211,153,0.06)', borderColor: 'rgba(52,211,153,0.3)', color: '#6ee7b7' }}>assistant</div>
              <p className="text-zinc-300 leading-relaxed mb-3">i'll start by mapping the current resolver and finding all references.</p>
              <div className="surface-inset p-3 mb-2"><span className="text-purple-300">$ rg "class.*Policy" -t py</span></div>
              <div className="surface-inset p-3 mb-2"><span className="text-zinc-300">edit leibniz/store.py <span className="diff-add">+12</span> <span className="diff-del">−3</span></span></div>
            </div>
            <div className="chip chip-amber"><StatusDot kind="amber" pulse size={5} />in flight · finalizing summary</div>
          </div>
        </Card>
      )}
    </div>
  );
}
window.SessionDetailScreen = SessionDetailScreen;
