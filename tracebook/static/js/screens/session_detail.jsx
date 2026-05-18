// Session detail: context window panel + trace waterfall + inspector

const { useState: useStateSD } = React;

// Abbreviate long absolute paths: keep `~` and last 2 segments:
//   /Users/andrew/vs_code_projects/ai_business/tracebook → ~/…/ai_business/tracebook
function abbreviateCwd(p) {
  if (!p) return '';
  let s = p;
  // Strip /Users/<name>/ → ~/
  s = s.replace(/^\/Users\/[^/]+\//, '~/');
  s = s.replace(/^\/home\/[^/]+\//, '~/');
  const parts = s.split('/').filter(Boolean);
  if (parts.length <= 4) return s;
  return `${parts[0]}/…/${parts.slice(-2).join('/')}`;
}

function singleLineText(text, limit = 138) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit).trimEnd()}...` : value;
}

// ─── Donut for context budget ────────────────────────────────────────────────

function ContextDonut({ used, max, categories, size = 146, stroke = 12 }) {
  const center = size / 2;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const scale = size / 170;
  // Effective max: never let the donut exceed 100% — if used > max the user
  // must be on a 1M tier we didn't detect, so widen the denominator.
  const effMax = Math.max(max, used, 1);
  const usedPct = Math.min(1, used / effMax);
  let acc = 0;
  const segs = categories.map((cat) => {
    const start = acc;
    const portion = Math.min(Math.max(0, 1 - acc), Math.max(0, cat.tokens / effMax));
    acc += portion;
    return { ...cat, start, portion };
  });
  const fmtMax = max >= 1e6 ? `${(max/1e6).toFixed(1)}M` : `${(max/1000).toFixed(0)}k`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={center} cy={center} r={r} fill="none" stroke="var(--bg-0)" strokeWidth={stroke} />
      {segs.map((s, i) => (
        <circle key={i} cx={center} cy={center} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
          strokeDasharray={`${s.portion * c} ${c}`} strokeDashoffset={-s.start * c}
          transform={`rotate(-90 ${center} ${center})`} strokeLinecap="butt" />
      ))}
      <text x={center} y={center - 6 * scale} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={Math.max(8, 9.5 * scale)} fill="var(--ink-3)">used</text>
      <text x={center} y={center + 13 * scale} textAnchor="middle" fontFamily="Inter Tight" fontWeight="600" fontSize={Math.max(18, 23 * scale)} letterSpacing="0" fill="#f4f4f5">{Math.round(usedPct * 100)}%</text>
      <text x={center} y={center + 29 * scale} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={Math.max(8, 9 * scale)} fill="var(--ink-4)">{window.formatNum(used)} / {fmtMax}</text>
    </svg>
  );
}

function ContextCategoryRows({ categories, denominator }) {
  const denom = Math.max(denominator, 1);
  return (
    <div className="context-category-stack">
      {categories.map(cat => {
        const pct = Math.max(0, (cat.tokens / denom) * 100);
        return (
          <div key={cat.key} className="context-category-row">
            <span className="context-category-swatch" style={{ background: cat.color }} />
            <span className="context-category-label">{cat.label}</span>
            <span className="context-category-value num">{window.formatNum(cat.tokens)}</span>
            <span className="context-category-percent num">{pct.toFixed(1)}%</span>
            <span className="context-category-bar">
              <span style={{ width: `${Math.min(100, pct)}%`, background: cat.color }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function contextItemName(item) {
  return item?.name || item?.path || 'not recorded';
}

function contextItemMeta(item) {
  if (!item) return '';
  if (item.source === 'context' && (!item.calls || item.calls <= 1)) return 'available';
  if (item.calls) return `${item.calls}x`;
  if (item.tokens) return window.formatNum(item.tokens);
  if (item.tools) return `${item.tools} tools`;
  if (item.transport) return item.transport;
  if (item.path) return 'seen';
  return '';
}

function sessionDetailForView(session) {
  const globalDetail = window._SESSION_DETAIL;
  return globalDetail && (globalDetail.id === session?.id || globalDetail.short === session?.short)
    ? globalDetail
    : (session || {});
}

function sessionTraceForView(session, trace) {
  return trace || session?.trace || { totalDuration: 0, totalTokens: 0, totalCost: 0, nodes: [] };
}

function SessionReadableShell({ kind, segments, activeId, onJump, children }) {
  return (
    <div className={`session-readable-shell ${kind || ''}`}>
      <TraceDurationRail segments={segments || []} totalMs={0} activeId={activeId} onJump={onJump} />
      <div className="session-readable-main">{children}</div>
    </div>
  );
}

function ContextPanel({ session }) {
  const ctx = window.CONTEXT_BUDGET || {};
  const items = window.CONTEXT_ITEMS || {};
  const contextUsed = Number(ctx.contextUsed || 0);
  const contextMax = Math.max(Number(ctx.contextMax || 0), contextUsed, 1);
  const compressions = items.compressions ?? session?.compressions ?? 0;
  const free = Math.max(0, contextMax - contextUsed);
  // Only show a "free" slice when there genuinely is free capacity left
  const cats = free > 0
    ? [...(ctx.categories || []), { key: 'free', label: 'free', tokens: free, color: '#27272a', glyph: 'database' }]
    : (ctx.categories || []);
  const systemTools = items.systemTools || [];

  return (
    <div className="session-context-readable">
      <div className="context-dashboard">
        <div className="context-top-grid">
          <div className="context-left-stack">
            <section className="surface-1 context-budget-panel">
              <Eyebrow num={1} label="context budget" meta={ctx.model || session?.model} />
              <div className="context-budget-main">
                <div className="context-donut-wrap">
                  <ContextDonut used={contextUsed} max={contextMax} categories={ctx.categories || []} size={132} stroke={11} />
                </div>
                <div className="context-budget-side">
                  <div className="context-budget-totals">
                    <div>
                      <span>used</span>
                      <strong className="num">{window.formatNum(contextUsed)}</strong>
                    </div>
                    <div>
                      <span>free</span>
                      <strong className="num">{window.formatNum(free)}</strong>
                    </div>
                    <div>
                      <span>window</span>
                      <strong className="num">{window.formatNum(contextMax)}</strong>
                    </div>
                  </div>
                  <ContextCategoryRows categories={cats} denominator={contextMax} />
                </div>
              </div>
              <div className="context-compact-count">
                <window.Icon.Layers size={13} />
                <span>dialogue compacting operations</span>
                <strong>{compressions}</strong>
              </div>
            </section>

            <section className="surface-1 context-tools-panel">
              <Eyebrow num={2} label="system tools" meta={`${systemTools.length} loaded`} />
              <div className="context-tools-grid">
                {systemTools.map(t => (
                  <div key={t.name} className="context-tool-pill">
                    <window.Icon.Tool size={12} />
                    <span className="context-tool-name">{t.name}</span>
                    <span className="context-tool-value num">{window.formatNum(t.tokens)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="context-inventory-panel">
            <Eyebrow num={3} label="what's in context" meta={`${compressions} dialogue compressions`} />
            <div className="context-inventory-grid">
              <ContextGroup title="custom agents" tone="violet" items={items.agents} icon="Brain" />
              <ContextGroup title="skills" tone="rose" items={items.skills} icon="Sparkles" />
              <ContextGroup title="mcp servers" tone="cyan" items={items.mcp} icon="Plug" />
              <ContextGroup title="memory files" tone="amber" items={items.memory} icon="File" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ContextGroup({ title, items, tone, icon }) {
  const IconC = window.Icon[icon];
  items = items || [];
  const isLong = items.length > 6;
  return (
    <div className={`surface-2 context-group tone-${tone} ${isLong ? 'scrollable' : ''}`}>
      <div className="context-group-head">
        <IconC size={13} className={`text-${tone === 'violet' ? 'violet' : tone === 'rose' ? 'rose' : tone === 'cyan' ? 'cyan' : 'amber'}-300`} />
        <span className="t-eyebrow">{title}</span>
        <span className="context-group-count num">{items.length}</span>
      </div>
      <ul className="context-group-list">
        {items.length ? items.map(it => (
          <li key={it.name || it.path} className="context-group-item">
            <span className="context-item-name" title={it.path || it.name}>{contextItemName(it)}</span>
            <span className="context-item-meta num">{contextItemMeta(it)}</span>
          </li>
        )) : (
          <li className="context-group-empty">not recorded</li>
        )}
      </ul>
    </div>
  );
}

// ─── Trace tree (left) ───────────────────────────────────────────────────────

const NODE_META = {
  assistant: { color: '#34d399', bg: 'rgba(52,211,153,0.13)', bar: 'rgba(52,211,153,0.30)', label: 'assistant', glyph: 'Cpu' },
  llm:       { color: '#fb923c', bg: 'rgba(251,146,60,0.16)', bar: 'rgba(154,83,18,0.70)', label: 'llm',       glyph: 'Sparkles' },
  tool:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.13)', bar: 'rgba(91,33,182,0.48)', label: 'tool',      glyph: 'Tool' },
  skill:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.13)', bar: 'rgba(146,64,14,0.58)', label: 'skill',      glyph: 'Sparkles' },
  mcp:       { color: '#67e8f9', bg: 'rgba(103,232,249,0.12)', bar: 'rgba(8,145,178,0.42)', label: 'mcp',       glyph: 'Plug' },
};

function NodeBadge({ type }) {
  const m = NODE_META[type];
  return <span className="font-mono text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}33` }}>{m.label}</span>;
}

function TraceTree({ nodes, selected, onSelect }) {
  if (!nodes.length) {
    return (
      <div className="trace-empty">
        <div className="font-mono text-[28px] mb-2">...</div>
        <div className="t-small">trace is loading</div>
      </div>
    );
  }
  return (
    <div className="trace-scroll surface-inset">
      <div className="trace-head grid items-center gap-2 px-3 py-2 t-eyebrow" style={{ gridTemplateColumns: '1fr 62px 80px 70px' }}>
        <span>node</span>
        <span className="text-right">time</span>
        <span className="text-right">tokens</span>
        <span className="text-right">cost</span>
      </div>
      {nodes.map(n => {
        const m = NODE_META[n.type];
        const Icn = window.Icon[m.glyph];
        return (
          <div key={n.id}
            onClick={() => onSelect(n.id)}
            className={`trace-row ${selected === n.id ? 'selected' : ''} grid items-center gap-2 py-2 pr-3`}
            style={{
              gridTemplateColumns: '1fr 62px 80px 70px',
              paddingLeft: 8 + n.depth * 16,
              borderLeft: `2px solid ${selected === n.id ? m.color : 'transparent'}`,
            }}
          >
            <div className="min-w-0 flex items-start gap-2">
              <span className="w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0" style={{ background: m.bg, color: m.color }}>
                <Icn size={10} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[12px] text-zinc-100 truncate">{n.name}</span>
                  {n.cacheRead > 0 && <span className="chip chip-cyan">cache {window.formatNum(n.cacheRead)}</span>}
                  {n.live && <span className="chip chip-emerald"><StatusDot kind="emerald" pulse size={4} /> live</span>}
                </div>
                {n.preview && <div className="font-mono text-[10.5px] truncate mt-0.5" style={{ color: 'var(--ink-4)' }}>{n.preview}</div>}
              </div>
            </div>
            <span className="font-mono num text-[10.5px] text-right" style={{ color: 'var(--ink-4)' }}>{(n.duration/1000).toFixed(2)}s</span>
            <span className="font-mono num text-[10.5px] text-right" style={{ color: 'var(--ink-3)' }}>{n.tokens.toLocaleString()}</span>
            <span className="font-mono num text-[10.5px] text-right" style={{ color: n.cost > 0 ? '#6ee7b7' : 'var(--ink-4)' }}>{n.cost > 0 ? `$${n.cost.toFixed(4)}` : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Waterfall view ──────────────────────────────────────────────────────────

function Waterfall({ nodes, total, selected, onSelect }) {
  if (!nodes.length || !total) {
    return (
      <div className="trace-empty surface-2">
        <div className="font-mono text-[28px] mb-2">...</div>
        <div className="t-small">trace is loading</div>
      </div>
    );
  }
  const totalMs = Math.max(total, ...nodes.map(n => (n.start || 0) + (n.duration || 0)), 1);
  const markers = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="surface-2 p-0 trace-scroll waterfall-shell">
      <div className="waterfall-grid waterfall-header">
        <div className="t-eyebrow px-3 py-2">node</div>
        <div className="waterfall-track-head">
          {markers.map(p => (
            <span key={p} className="waterfall-tick-label" style={{ left: `${p * 100}%` }}>
              {(totalMs * p / 1000).toFixed(1)}s
            </span>
          ))}
        </div>
      </div>
      {nodes.map((n) => {
          const m = NODE_META[n.type];
          const Icn = window.Icon[m.glyph];
          const left = Math.max(0, (n.start / totalMs) * 100);
          const width = Math.max(0.6, (n.duration / totalMs) * 100);
          return (
            <div
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={`waterfall-grid waterfall-row trace-row ${selected === n.id ? 'selected' : ''}`}
            >
              <div className="waterfall-label" style={{ paddingLeft: 10 + n.depth * 14 }}>
                <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: m.bg, color: m.color }}>
                  <Icn size={9} />
                </span>
                <span className="font-mono text-[11.5px] text-zinc-200 truncate">{n.name}</span>
              </div>
              <div className="waterfall-track">
                {markers.map(p => <span key={p} className="waterfall-tick" style={{ left: `${p * 100}%` }} />)}
                <div
                  className="waterfall-bar"
                  style={{
                    left: `${left}%`,
                    width: `${Math.min(width, 100 - left)}%`,
                    background: m.bg,
                    borderLeft: `2px solid ${m.color}`,
                    boxShadow: n.live ? `0 0 8px ${m.color}66` : 'none',
                  }}
                >
                  {width > 11 && (
                    <span className="font-mono text-[9.5px]" style={{ color: m.color }}>
                    {n.tokens > 0 ? `${n.tokens.toLocaleString()} tok` : ''}
                  </span>
                )}
              </div>
            </div>
            </div>
          );
        })}
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

function compactTranscript(rawTurns) {
  const dedupeBlocks = (text) => {
    const blocks = String(text || '')
      .split(/\n{2,}/)
      .map(part => part.trim())
      .filter(Boolean);
    const out = [];
    for (const block of blocks) {
      if (out[out.length - 1] === block) continue;
      out.push(block);
    }
    return out.join('\n\n');
  };

  const out = [];
  for (const turn of rawTurns || []) {
    if (turn.kind && turn.kind !== 'message') {
      out.push(turn);
      continue;
    }
    const text = dedupeBlocks(turn.text);
    if (!text) continue;
    const last = out[out.length - 1];
    if (!last || last.role !== turn.role) {
      out.push({ ...turn, text });
      continue;
    }
    const blocks = text.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
    const existing = last.text.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
    for (const block of blocks) {
      if (existing[existing.length - 1] === block) continue;
      existing.push(block);
    }
    last.text = existing.join('\n\n');
  }
  return out;
}

function traceSeconds(ms) {
  const seconds = Math.max(0, Number(ms || 0) / 1000);
  if (seconds > 60) {
    const minutes = seconds / 60;
    return `${minutes >= 10 ? minutes.toFixed(0) : minutes.toFixed(1)}m`;
  }
  if (seconds >= 100) return `${seconds.toFixed(0)}s`;
  if (seconds >= 10) return `${seconds.toFixed(1)}s`;
  return `${seconds.toFixed(2)}s`;
}

function CostValue({ value, suffix = '' }) {
  const amount = Number(value || 0);
  const decimals = amount >= 10 ? 2 : amount >= 1 ? 2 : 4;
  return (
    <>
      <span className="money-symbol">$</span>{amount.toFixed(decimals)}{suffix}
    </>
  );
}

function traceValueLabel(n) {
  const pieces = [];
  if (n.tokens > 0) pieces.push(window.formatNum(n.tokens));
  if (n.cost > 0) pieces.push(`$${n.cost.toFixed(n.cost >= 10 ? 2 : 4)}`);
  if (!pieces.length && n.cacheRead > 0) pieces.push(`${window.formatNum(n.cacheRead)} cache`);
  return pieces.join(' / ');
}

function traceDialoguePayload(value) {
  if (!hasValue(value)) return '';
  if (typeof value !== 'object') return value;
  try {
    const json = JSON.stringify(value);
    if (json.length <= 3600) return value;
  } catch (err) {
    return String(value);
  }
  const compact = {};
  [
    'cmd', 'command', 'workdir', 'file_path', 'path', 'source_file',
    'document_url', 'spreadsheet_url', 'presentation_url', 'message',
    'text', 'preview', 'result', 'outputPreview', 'thoughts',
    'reasoning_summary',
  ].forEach(key => {
    if (hasValue(value[key])) compact[key] = value[key];
  });
  return Object.keys(compact).length ? compact : JSON.stringify(value).slice(0, 3600) + '...';
}

function tracePayloadText(value, fallback = '') {
  if (!hasValue(value)) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  const candidate = primaryCommand(value)
    || value.message
    || value.text
    || value.thoughts
    || value.reasoning_summary
    || value.result
    || value.preview
    || value.outputPreview
    || fallback;
  if (candidate && typeof candidate === 'object') {
    try {
      return JSON.stringify(candidate, null, 2);
    } catch (err) {
      return String(candidate);
    }
  }
  return candidate;
}

function detailPayloadText(value) {
  if (!hasValue(value)) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return String(value);
  }
}

function traceDialogueEntryFor(node, detail) {
  const input = traceDialoguePayload(detail.input || node.detail?.input || {});
  const output = traceDialoguePayload(detail.output || node.detail?.output || {});
  const inputPreview = tracePayloadText(input, '');
  const outputPreview = tracePayloadText(output, node.preview || '');
  const role = (node.type === 'llm' || node.type === 'assistant') ? 'model' : 'tool';
  const entry = {
    role,
    type: node.type,
    name: node.name,
    at: traceSeconds(node.start),
  };
  if (inputPreview) entry.input_preview = inputPreview;
  if (outputPreview) entry.output_preview = outputPreview;
  if (input && (typeof input !== 'object' || Object.keys(input).length)) entry.input = input;
  if (output && (typeof output !== 'object' || Object.keys(output).length)) entry.output = output;
  if (node.tokens > 0) entry.tokens = node.tokens;
  if (node.cost > 0) entry.cost = Number(node.cost.toFixed(6));
  return entry;
}

function dialogueBeforeNode(node, nodeDetail, trace) {
  const activeUser = userInputForNode(node);
  const entries = [];
  if (activeUser?.text) {
    entries.push({
      role: 'user',
      name: `user input ${activeUser.index + 1}`,
      at: activeUser.offset == null ? '0.00s' : traceSeconds(activeUser.offset),
      text: activeUser.text,
    });
  }
  const nodes = trace?.nodes || [];
  const selectedIndex = nodes.findIndex(n => n.id === node.id);
  const boundary = activeUser?.offset ?? 0;
  nodes.forEach((candidate, index) => {
    if (selectedIndex >= 0 && index >= selectedIndex) return;
    if (candidate.id === node.id) return;
    if ((candidate.start || 0) < boundary - 1) return;
    if (candidate.type === 'user') return;
    const detail = nodeDetail[candidate.id] || {};
    entries.push(traceDialogueEntryFor(candidate, detail));
  });
  return entries;
}

function tracePayloadFor(node, nodeDetail, trace) {
  const detail = nodeDetail[node.id] || {};
  const userRequest = userInputForNode(node)?.text || sessionUserRequest();
  const dialogue = dialogueBeforeNode(node, nodeDetail, trace);
  const fallbackInput = {
    name: node.name,
    preview: node.preview || '',
    input_tokens: node.inputTokens || 0,
    cache_read_tokens: node.cacheRead || 0,
  };
  let input = detail.input || fallbackInput;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    input = { raw_input: input };
  }
  if (userRequest) {
    input = { user_input: userRequest, dialogue_before_call: dialogue, ...input };
  }
  return {
    input,
    output: detail.output || {
      duration_ms: node.duration || 0,
      output_tokens: node.outputTokens || 0,
      status: node.status || 'completed',
    },
    attributes: detail.attributes || {
      id: node.id,
      type: node.type,
      parent: node.parent,
      depth: node.depth,
      live: !!node.live,
    },
  };
}

function sessionUserRequest() {
  return sessionUserInputs()[0]?.text || '';
}

function sessionUserInputs() {
  const detail = window._SESSION_DETAIL || {};
  const turns = detail.transcript || [];
  const originAt = detail.trace?.originAt || detail.startedAt;
  const startedMs = originAt ? new Date(originAt).getTime() : NaN;
  const rows = turns
    .filter(t => t && t.kind !== 'tool' && t.kind !== 'compression' && t.role === 'user' && t.text)
    .map((t, i) => {
      const tsMs = t.ts ? new Date(t.ts).getTime() : NaN;
      return {
        id: `user-${i}`,
        index: i,
        text: t.text,
        ts: t.ts || '',
        offset: Number.isFinite(startedMs) && Number.isFinite(tsMs) ? Math.max(0, tsMs - startedMs) : null,
      };
    });
  if (rows.length) return rows;
  return detail.preview ? [{ id: 'user-0', index: 0, text: detail.preview, ts: detail.startedAt || '', offset: 0 }] : [];
}

function userInputForNode(node) {
  const inputs = sessionUserInputs();
  if (!inputs.length) return null;
  const start = Number(node?.start || 0);
  let active = inputs[0];
  for (const input of inputs) {
    if (input.offset == null) {
      if (input.index <= 0) active = input;
      continue;
    }
    if (input.offset <= start + 1) active = input;
  }
  return active;
}

function userMarkersForNodes(nodes, inputs) {
  const byNode = new Map();
  const used = new Set();
  const llmNodes = nodes.filter(n => n.type === 'llm');
  inputs.forEach((input, i) => {
    let target = null;
    if (input.offset != null) {
      target = nodes.find(n => n.start >= input.offset && n.type !== 'assistant')
        || [...nodes].reverse().find(n => n.start <= input.offset && n.type !== 'assistant')
        || llmNodes.find(n => n.start >= input.offset)
        || nodes.find(n => n.type !== 'assistant');
    }
    if (!target) target = llmNodes[Math.min(i, Math.max(llmNodes.length - 1, 0))] || nodes[0];
    if (!target || used.has(input.id)) return;
    used.add(input.id);
    const list = byNode.get(target.id) || [];
    list.push(input);
    byNode.set(target.id, list);
  });
  return byNode;
}

function visibleTraceNodes(nodes, collapsed) {
  const byId = {};
  for (const n of nodes) byId[n.id] = n;
  return nodes.filter(n => {
    let parentId = n.parent;
    while (parentId) {
      if (collapsed.has(parentId)) return false;
      parentId = byId[parentId]?.parent;
    }
    return true;
  });
}

function LangSmithTraceIcon({ node, size = 18 }) {
  const meta = NODE_META[node.type] || NODE_META.tool;
  const IconC = window.Icon[meta.glyph] || window.Icon.Tool;
  const isLlm = node.type === 'llm';
  return (
    <span
      className={`ls-node-icon ${isLlm ? 'is-llm' : ''}`}
      style={{ width: size, height: size, color: meta.color, background: meta.bg }}
    >
      <IconC size={Math.max(9, size - 7)} />
    </span>
  );
}

function LangSmithTraceView({ session, trace, selected, onSelect, nodeDetail }) {
  const nodes = trace.nodes || [];
  const [collapsed, setCollapsed] = useStateSD(new Set());
  const [leftWidth, setLeftWidth] = useStateSD(() => {
    const saved = Number(window.localStorage?.getItem('tracebook.trace.leftWidth') || 0);
    return saved > 0 ? saved : 610;
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useStateSD(false);
  const [waterfallHidden, setWaterfallHidden] = useStateSD(() => window.localStorage?.getItem('tracebook.trace.waterfallHidden') === '1');
  const userInputs = sessionUserInputs();
  const selectedNode = nodes.find(n => n.id === selected) || nodes[0];
  const [activeUserId, setActiveUserId] = useStateSD(() => userInputForNode(selectedNode)?.id || userInputs[0]?.id || null);
  const shellRef = React.useRef(null);
  const runListRef = React.useRef(null);
  const markerRefs = React.useRef({});
  const totalMs = Math.max(trace.totalDuration || 0, ...nodes.map(n => (n.start || 0) + (n.duration || 0)), 1);
  const markers = totalMs > 10 * 60 * 1000
    ? [0, .5, 1]
      : [0, .25, .5, .75, 1];
  const childCount = {};
  for (const n of nodes) {
    if (n.parent) childCount[n.parent] = (childCount[n.parent] || 0) + 1;
  }
  const shown = visibleTraceNodes(nodes, collapsed);
  const userMarkers = userMarkersForNodes(shown, userInputs);
  const activeUser = userInputs.find(input => input.id === activeUserId) || userInputForNode(selectedNode) || userInputs[0];
  const rootNode = nodes.find(n => !n.parent) || nodes[0];
  const [showStickyUser, setShowStickyUser] = useStateSD(false);

  React.useEffect(() => {
    const selectedUser = userInputForNode(selectedNode);
    if (selectedUser?.id) setActiveUserId(selectedUser.id);
  }, [selected, nodes.length]);

  const updateActiveUserFromScroll = () => {
    const list = runListRef.current;
    if (!list || !userInputs.length) return;
    setShowStickyUser(list.scrollTop > 12);
    const top = list.getBoundingClientRect().top + 8;
    let current = userInputs[0];
    for (const input of userInputs) {
      const marker = markerRefs.current[input.id];
      if (marker && marker.getBoundingClientRect().top <= top) current = input;
    }
    setActiveUserId(current.id);
  };

  const scrollToActiveUser = () => {
    if (!activeUser) return;
    const marker = markerRefs.current[activeUser.id];
    if (marker) marker.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (rootNode) onSelect(rootNode.id);
  };

  React.useEffect(() => {
    const id = window.requestAnimationFrame(updateActiveUserFromScroll);
    return () => window.cancelAnimationFrame(id);
  }, [shown.length, userInputs.length, waterfallHidden]);

  const toggleCollapsed = (id, e) => {
    e.stopPropagation();
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetLayout = () => {
    setLeftWidth(610);
    setInspectorCollapsed(false);
    setWaterfallHidden(false);
    window.localStorage?.removeItem('tracebook.trace.leftWidth');
    window.localStorage?.removeItem('tracebook.trace.waterfallHidden');
  };
  const toggleWaterfall = () => {
    setWaterfallHidden(v => {
      const next = !v;
      window.localStorage?.setItem('tracebook.trace.waterfallHidden', next ? '1' : '0');
      return next;
    });
  };

  const startSplitResize = (e) => {
    const shell = shellRef.current;
    if (!shell || inspectorCollapsed) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch (_) {
      // Some synthetic pointer events do not have an active pointer capture target.
    }
    const rect = shell.getBoundingClientRect();
    const minLeft = 420;
    const minRight = 440;
    const onMove = (ev) => {
      const next = Math.max(minLeft, Math.min(rect.width - minRight - 8, ev.clientX - rect.left));
      setLeftWidth(next);
      window.localStorage?.setItem('tracebook.trace.leftWidth', String(Math.round(next)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  if (!nodes.length) {
    return (
      <div className="ls-trace-shell">
        <div className="ls-empty-trace">trace is loading</div>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`ls-trace-shell ${inspectorCollapsed ? 'inspector-collapsed' : ''} ${waterfallHidden ? 'waterfall-hidden' : ''}`}
      style={{ '--ls-left-width': `${leftWidth}px` }}
    >
      <div className="ls-trace-left">
        <div className="ls-trace-left-head">
          <div className="ls-trace-title">Trace</div>
          <div className="ls-trace-tools">
            <button className={`ls-tool-button ${waterfallHidden ? '' : 'active'}`} onClick={toggleWaterfall}>
              {waterfallHidden ? 'Show timeline' : 'Waterfall'}
            </button>
            <button className="ls-icon-button" title="settings"><window.Icon.Settings size={14} /></button>
            <button className="ls-icon-button" title="fit"><window.Icon.Maximize size={14} /></button>
            <button className="ls-tool-button muted" onClick={resetLayout}>Reset</button>
            <button className="ls-icon-button" title="zoom"><window.Icon.Search size={14} /></button>
            <button
              className={`ls-icon-button ${inspectorCollapsed ? 'active' : ''}`}
              title={inspectorCollapsed ? 'show inspector' : 'hide inspector'}
              onClick={() => setInspectorCollapsed(v => !v)}
            >
              <window.Icon.Layers size={14} />
            </button>
          </div>
        </div>

        {activeUser && showStickyUser && (
          <button className="ls-trace-user-input" onClick={scrollToActiveUser}>
            <span><window.Icon.Sessions size={12} /> user input {userInputs.length > 1 ? `${activeUser.index + 1}/${userInputs.length}` : ''}</span>
            <strong>{activeUser.text}</strong>
          </button>
        )}

        {!waterfallHidden && (
          <div className="ls-time-grid">
            <div />
            <div className="ls-time-axis">
              {markers.map(p => (
                <span key={p} className="ls-time-mark" style={{ left: `${p * 100}%` }}>
                  {traceSeconds(totalMs * p)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="ls-run-list" ref={runListRef} onScroll={updateActiveUserFromScroll}>
          {shown.map(n => {
            const meta = NODE_META[n.type] || NODE_META.tool;
            const hasChildren = (childCount[n.id] || 0) > 0 || (n.children || []).length > 0;
            const isCollapsed = collapsed.has(n.id);
            const left = Math.max(0, Math.min(99.4, ((n.start || 0) / totalMs) * 100));
            const width = Math.max(0.65, Math.min(100 - left, ((n.duration || 0) / totalMs) * 100));
            const label = traceValueLabel(n);
            return (
              <React.Fragment key={n.id}>
                {(userMarkers.get(n.id) || []).map(input => (
                  <button
                    key={input.id}
                    ref={el => { if (el) markerRefs.current[input.id] = el; }}
                    className={`ls-user-marker-row ${activeUser?.id === input.id ? 'active' : ''}`}
                    onClick={() => { setActiveUserId(input.id); if (rootNode) onSelect(rootNode.id); }}
                  >
                    <span><window.Icon.Sessions size={12} /> user input {userInputs.length > 1 ? `${input.index + 1}/${userInputs.length}` : ''}</span>
                    <strong>{input.text}</strong>
                  </button>
                ))}
                <div
                  className={`ls-run-row ${selected === n.id ? 'selected' : ''}`}
                  onClick={() => onSelect(n.id)}
                >
                  <div className="ls-run-label" style={{ paddingLeft: 14 + Math.min(n.depth || 0, 9) * 18 }}>
                    <LangSmithTraceIcon node={n} />
                    <span className="ls-run-name" title={n.name}>{n.name}</span>
                    <span className="ls-run-duration">{traceSeconds(n.duration)}</span>
                    {label && <span className="ls-run-chip">{label}</span>}
                  </div>
                  {!waterfallHidden && (
                    <div className="ls-run-track">
                      {markers.map(p => <span key={p} className="ls-run-tick" style={{ left: `${p * 100}%` }} />)}
                      <div
                        className="ls-run-bar"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: selected === n.id ? 'rgba(52,211,153,0.32)' : meta.bar || meta.bg,
                          borderLeftColor: meta.color,
                        }}
                      />
                    </div>
                  )}
                  <div className="ls-run-actions">
                    {hasChildren && (
                      <button className="ls-chevron" onClick={(e) => toggleCollapsed(n.id, e)} title={isCollapsed ? 'expand' : 'collapse'}>
                        {isCollapsed ? <window.Icon.ChevronRight size={13} /> : <window.Icon.ChevronDown size={13} />}
                      </button>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {!inspectorCollapsed && <div className="ls-trace-splitter" onPointerDown={startSplitResize} title="drag to resize panes" />}

      {!inspectorCollapsed && (
        <LangSmithInspector nodeId={selected} trace={trace} nodeDetail={nodeDetail} session={session} />
      )}
    </div>
  );
}

function InspectorSection({ title, mode, defaultOpen = true, children, right }) {
  const [open, setOpen] = useStateSD(defaultOpen);
  return (
    <section className="ls-inspector-section">
      <button className="ls-section-head" onClick={() => setOpen(v => !v)}>
        {open ? <window.Icon.ChevronDown size={14} /> : <window.Icon.ChevronRight size={14} />}
        <span>{title}</span>
        <span className="ls-section-mode">{mode}</span>
        {right}
      </button>
      {open && <div className="ls-section-body">{children}</div>}
    </section>
  );
}

function FieldRows({ value }) {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const keys = Object.keys(obj);
  if (!keys.length) {
    return <div className="ls-empty-fields">no fields recorded</div>;
  }
  return (
    <div className="ls-field-card">
      <div className="ls-field-card-head">
        <span className="ls-json-mini">{'{}'}</span>
        <span>Fields</span>
      </div>
      {keys.slice(0, 10).map(k => {
        const v = obj[k];
        const preview = v && typeof v === 'object'
          ? (Array.isArray(v) ? `[${v.length}]` : '{}')
          : String(v ?? '');
        return (
          <div key={k} className="ls-field-row">
            <span className="ls-field-dot" />
            <span className="ls-field-key">{k}</span>
            <span className="ls-field-value">{preview}</span>
          </div>
        );
      })}
    </div>
  );
}

function JsonPanel({ value, compact = false }) {
  return (
    <div className={`ls-json-panel ${compact ? 'compact' : ''}`}>
      <pre>{jsonHighlight(value || {})}</pre>
      <div className="ls-json-footer">
        <span>RAW</span>
        <button className="ls-copy-small" onClick={() => window.copyText(JSON.stringify(value || {}, null, 2))}>
          <window.Icon.Copy size={13} />
        </button>
      </div>
    </div>
  );
}

function hasValue(v) {
  return v !== undefined && v !== null && v !== '';
}

function primaryCommand(input) {
  if (!input || typeof input !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(input, 'chars')) {
    return visibleShellInput(input.chars);
  }
  return input.cmd || input.command || input.input_preview || '';
}

function visibleShellInput(value) {
  const text = String(value ?? '');
  if (!text) return '';
  return JSON.stringify(text)
    .slice(1, -1)
    .replace(/\\u0003/g, '^C');
}

function DialogueBeforeCall({ entries }) {
  if (!entries || !entries.length) return null;
  return (
    <div className="ls-dialogue-context">
      <div className="ls-dialogue-head">
        <span>dialogue before this call</span>
        <em>{entries.length} items</em>
      </div>
      {entries.map((entry, index) => {
        const text = entry.text || entry.output_preview || entry.input_preview || '';
        return (
          <div key={`${entry.role}-${entry.name}-${index}`} className={`ls-dialogue-entry ${entry.role}`}>
            <div className="ls-dialogue-entry-head">
              <span>{entry.role}</span>
              <strong>{entry.name}</strong>
              <em>{entry.at}</em>
            </div>
            {text ? (
              <CodeSnippet text={String(text)} maxChars={1200} maxLines={14} />
            ) : (
              <div className="ls-empty-fields">no preview recorded</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PrimaryPayload({ value, node, mode }) {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const tool = node?.detail?.attributes?.tool || {};
  const isShellInput = mode === 'input' && (tool.rawName === 'write_stdin' || node?.name === 'shell input' || Object.prototype.hasOwnProperty.call(obj, 'chars'));
  const command = mode === 'input' ? primaryCommand(obj) : '';
  const file = obj.file_path || obj.path || obj.source_file || obj.document_url || obj.spreadsheet_url || obj.presentation_url;
  const userRequest = obj.user_request || obj.userRequest || '';
  const text = typeof value === 'string' ? value : (obj.message || obj.text || obj.result || obj.preview || obj.outputPreview || '');
  const entries = Object.entries(obj).filter(([k, v]) => {
    if (!hasValue(v)) return false;
    return !['cmd', 'command', 'result', 'preview', 'message', 'text', 'user_request', 'userRequest', 'user_input', 'dialogue_before_call'].includes(k) && !String(k).endsWith('_chars');
  }).slice(0, 8);

  if (isShellInput) {
    const stdin = visibleShellInput(obj.chars);
    return (
      <div className="ls-primary-block command">
        <div className="ls-primary-kicker">
          <window.Icon.Terminal size={13} /> shell input
          {obj.session_id && <span>session {obj.session_id}</span>}
        </div>
        {stdin ? (
          <CodeSnippet text={stdin} shell maxChars={1200} maxLines={12} />
        ) : (
          <div className="ls-empty-fields">no stdin sent; waiting for process output</div>
        )}
      </div>
    );
  }

  if (command) {
    return (
      <div className="ls-primary-block command">
        <div className="ls-primary-kicker">
          <window.Icon.Terminal size={13} /> command
          {obj.workdir && <span title={obj.workdir}>{abbreviateCwd(obj.workdir)}</span>}
        </div>
        <CodeSnippet text={command} shell />
      </div>
    );
  }

  if (file) {
    return (
      <div className="ls-primary-block file">
        <div className="ls-primary-kicker">
          <window.Icon.File size={13} /> {node?.detail?.attributes?.tool?.category || 'file'}
        </div>
        <CodeSnippet text={file} />
      </div>
    );
  }

  if (userRequest) {
    return (
      <div className="ls-primary-block user-request">
        <div className="ls-primary-kicker">
          <window.Icon.Sessions size={13} /> user request
        </div>
        <CodeSnippet text={String(userRequest)} maxChars={4200} maxLines={42} />
      </div>
    );
  }

  if (text) {
    return (
      <div className={`ls-primary-block ${mode === 'output' ? 'output' : ''}`}>
        <CodeSnippet text={String(text)} />
      </div>
    );
  }

  if (entries.length) {
    return (
      <div className="ls-mini-kv">
        {entries.map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <strong>{typeof v === 'object' ? (Array.isArray(v) ? `[${v.length}]` : '{}') : String(v)}</strong>
          </div>
        ))}
      </div>
    );
  }

  return <div className="ls-empty-fields">nothing recorded</div>;
}

function followingTraceBlocks(node, trace) {
  const nodes = trace.nodes || [];
  const direct = nodes.filter(n => n.parent === node.id);
  if (direct.length) return direct;
  const start = nodes.findIndex(n => n.id === node.id);
  if (start < 0) return [];
  const out = [];
  for (const candidate of nodes.slice(start + 1)) {
    if (candidate.type === 'llm' && (candidate.depth || 0) <= (node.depth || 0)) break;
    if (['tool', 'mcp', 'skill'].includes(candidate.type)) out.push(candidate);
  }
  return out;
}

function thoughtTextFor(payload, node) {
  const output = payload.output || {};
  return output.thoughts || output.reasoning_summary || output.message || node.preview || '';
}

function FollowToolBlock({ node, nodeDetail }) {
  const detail = nodeDetail[node.id] || node.detail || {};
  const input = detail.input || {};
  const output = detail.output || {};
  const meta = NODE_META[node.type] || NODE_META.tool;
  const outputText = output.preview || output.result || output.message || output.outputPreview || '';
  const isPatch = node.name === 'patch' || looksLikeDiff(primaryCommand(input) || input.text || '');
  return (
    <div className="ls-follow-block" style={{ '--follow-color': meta.color }}>
      <div className="ls-follow-head">
        <LangSmithTraceIcon node={node} size={20} />
        <span>{node.name}</span>
        <em>{traceSeconds(node.duration)}</em>
      </div>
      <PrimaryPayload
        value={input}
        node={{ ...node, detail: { attributes: detail.attributes || {} } }}
        mode="input"
      />
      {outputText && (
        <details className="ls-follow-output">
          <summary>tool output</summary>
          <CodeSnippet text={String(outputText)} forceDiff={isPatch} maxChars={1800} maxLines={22} />
        </details>
      )}
    </div>
  );
}

function LlmOutputBlocks({ node, trace, nodeDetail, payload }) {
  const thoughts = thoughtTextFor(payload, node);
  const calls = generatedToolCallsForOutput(payload.output);
  const blocks = followingTraceBlocks(node, trace);
  if (!thoughts && !calls.length && !blocks.length) {
    return <PrimaryPayload value={payload.output} node={{ ...node, detail: { attributes: payload.attributes } }} mode="output" />;
  }
  return (
    <div className="ls-llm-output-stack">
      {thoughts ? (
        <div className="ls-primary-block thoughts">
          <div className="ls-primary-kicker">
            <window.Icon.Brain size={13} /> thoughts
          </div>
          <CodeSnippet text={String(thoughts)} maxChars={3600} maxLines={36} />
        </div>
      ) : (
        <div className="ls-empty-fields">no thoughts recorded</div>
      )}
      <GeneratedToolCallsBlock calls={calls} />
      {blocks.map(child => <FollowToolBlock key={child.id} node={child} nodeDetail={nodeDetail} />)}
    </div>
  );
}

function RawDetails({ title = 'raw', value }) {
  return (
    <details className="ls-raw-details">
      <summary>{title}</summary>
      <JsonPanel value={value || {}} compact />
    </details>
  );
}

function codeLineClass(line) {
  if (/^\+\+\+|^---|^@@/.test(line)) return 'diff-meta';
  if (/^\+/.test(line)) return 'diff-add-line';
  if (/^-/.test(line)) return 'diff-del-line';
  if (/^\*\*\* (Begin|End|Update|Add|Delete)/.test(line)) return 'diff-meta';
  return '';
}

function looksLikeDiff(text) {
  return /^\*\*\* Begin Patch/m.test(text)
    || /^diff --git /m.test(text)
    || /^@@ /m.test(text)
    || /^\+\+\+ /m.test(text);
}

function CodeSnippet({ text, shell = false, forceDiff = false, maxChars = 2200, maxLines = 34 }) {
  const value = String(text || '');
  const lines = value.split('\n');
  const isLarge = value.length > maxChars || lines.length > maxLines;
  const isDiff = forceDiff || looksLikeDiff(value);
  const renderShellLine = (line) => {
    if (!shell || isDiff) return line || ' ';
    const parts = String(line || ' ').split(/(\$)/g);
    return parts.map((part, idx) => (
      part === '$' ? <span key={idx} className="shell-dollar">$</span> : part
    ));
  };
  const renderLines = (shownLines) => (
    <pre className={`code-snippet ${shell ? 'shell' : ''} ${isDiff ? 'diff' : ''}`}>
      {shownLines.map((line, i) => (
        <span key={i} className={isDiff ? codeLineClass(line) : ''}>
          {renderShellLine(line)}
        </span>
      ))}
    </pre>
  );

  if (!isLarge) return renderLines(lines);

  const preview = lines.slice(0, Math.min(maxLines, 18));
  return (
    <div className="code-expand">
      {renderLines(preview)}
      <details>
        <summary>show full block · {lines.length} lines · {value.length.toLocaleString()} chars</summary>
        {renderLines(lines)}
      </details>
    </div>
  );
}

function operationClassForCategory(category) {
  const clean = String(category || 'tool').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `op-${clean}`;
}

function operationClassForTurn(turn) {
  if (!turn) return 'op-tool';
  if (turn.kind === 'compression') return 'op-system';
  if (turn.kind === 'tool') return operationClassForCategory(turn.category);
  if (turn.role === 'assistant') return 'op-model';
  if (turn.role === 'user') return 'op-user';
  return 'op-tool';
}

function transcriptText(t) {
  if (t.kind === 'tool') {
    const input = t.input || {};
    const command = primaryCommand(input);
    if (t.rawName === 'write_stdin' && !command) return '';
    const head = `${t.name || t.rawName || 'tool'}${command ? `: ${command}` : t.text ? `: ${t.text}` : ''}`;
    const output = t.outputPreview || (typeof t.output === 'string' ? t.output : '');
    return output ? `${head}\n${output}` : head;
  }
  if (t.kind === 'compression') return `[compression] ${t.text || 'conversation compressed'}`;
  return `${t.role}: ${t.text || ''}`;
}

function TranscriptBlock({ turn }) {
  if (turn.kind === 'compression') {
    return (
      <div className="transcript-compression">
        <window.Icon.Layers size={13} />
        <span>{turn.text || 'conversation compressed'}</span>
        {turn.ts && <time>{new Date(turn.ts).toLocaleString()}</time>}
      </div>
    );
  }

  if (turn.kind === 'tool') {
    const input = turn.input || {};
    const command = primaryCommand(input);
    if (turn.rawName === 'write_stdin' && !command) return null;
    const file = input.file_path || input.path || input.source_file || input.document_url || input.spreadsheet_url || input.presentation_url;
    const title = turn.name || turn.rawName || 'tool';
    const isPatch = title === 'patch' || looksLikeDiff(command || turn.text || '');
    const opClass = operationClassForCategory(turn.category);
    return (
      <div className={`transcript-tool ${turn.category || 'tool'} ${opClass}`}>
        <div className="transcript-tool-head">
          <span className={`chip operation-chip ${opClass}`}>{title}</span>
          {turn.status && <span className="t-meta">{turn.status}</span>}
          {turn.ts && <time className="t-meta">{new Date(turn.ts).toLocaleString()}</time>}
        </div>
        {command ? (
          <div className="transcript-command">
            <CodeSnippet text={command} shell={!isPatch} forceDiff={isPatch} />
          </div>
        ) : file ? (
          <div className="transcript-command file">
            <CodeSnippet text={file} />
          </div>
        ) : turn.text ? (
          <p>{turn.text}</p>
        ) : null}
        {(turn.outputPreview || turn.output) && (
          <details className="transcript-tool-output">
            <summary>output</summary>
            <CodeSnippet text={turn.outputPreview || (typeof turn.output === 'string' ? turn.output : JSON.stringify(turn.output, null, 2))} />
          </details>
        )}
      </div>
    );
  }

  const isUser = turn.role === 'user';
  return (
    <div className={`transcript-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={isUser ? 'chip transcript-user-chip' : 'chip transcript-assistant-chip'}>
          {isUser ? 'user input' : 'assistant'}
        </span>
        {turn.ts && <time className="t-meta" style={{ fontSize: '10px' }}>{new Date(turn.ts).toLocaleString()}</time>}
      </div>
      <p>{turn.text}</p>
    </div>
  );
}

function visibleTranscriptTurn(turn) {
  if (!turn) return false;
  if (turn.kind !== 'tool') return true;
  const input = turn.input || {};
  const command = primaryCommand(input);
  const file = input.file_path || input.path || input.source_file || input.document_url || input.spreadsheet_url || input.presentation_url;
  if (turn.rawName === 'write_stdin' && !command) return false;
  return !!(command || file || turn.text || turn.outputPreview || turn.output);
}

function parseWallTimeMs(text) {
  const match = String(text || '').match(/Wall time:\s*([0-9.]+)\s*seconds/i);
  return match ? Math.max(120, Number(match[1]) * 1000) : null;
}

function textPrefixMatch(a, b, minLength = 28) {
  const left = String(a || '').replace(/\s+/g, ' ').trim();
  const right = String(b || '').replace(/\s+/g, ' ').trim();
  if (!left || !right) return false;
  const size = Math.min(left.length, right.length, 160);
  if (size < minLength) return false;
  return left.slice(0, size) === right.slice(0, size);
}

function traceNodeCallId(node) {
  return node?.detail?.attributes?.call_id
    || node?.detail?.attributes?.callId
    || node?.detail?.attributes?.tool_use_id
    || '';
}

function toolInputMatchKey(input) {
  if (!input || typeof input !== 'object') return '';
  const command = primaryCommand(input);
  if (command) return `command:${command}`;
  const file = input.file_path || input.path || input.source_file;
  if (file) return `file:${file}`;
  const url = input.url || input.document_url || input.spreadsheet_url || input.presentation_url;
  if (url) return `url:${url}`;
  const query = input.query || input.pattern;
  if (query) return `query:${query}`;
  return '';
}

function turnTimelineRow(turn, index, originMs, totalMs, traceNodes) {
  const tsMs = turn.ts ? new Date(turn.ts).getTime() : NaN;
  const start = Number.isFinite(originMs) && Number.isFinite(tsMs)
    ? Math.max(0, tsMs - originMs)
    : Math.min(totalMs, index * 500);
  const command = turn.kind === 'tool' ? primaryCommand(turn.input || {}) : '';
  const turnInputKey = turn.kind === 'tool' ? toolInputMatchKey(turn.input || {}) : '';
  const llmNodes = (traceNodes || []).filter(n => n.type === 'llm');
  let matched = null;
  if (turn.role === 'assistant') {
    matched = llmNodes.find(n => textPrefixMatch(turn.text, n.preview));
  }
  if (!matched && turn.role === 'assistant') {
    matched = llmNodes
      .map(n => ({ node: n, delta: Math.abs((n.start || 0) - start) }))
      .filter(item => item.delta <= 20000)
      .sort((a, b) => a.delta - b.delta)[0]?.node || null;
  }
  if (!matched) matched = (traceNodes || []).find(n => {
    const delta = Math.abs((n.start || 0) - start);
    if (turn.kind === 'tool') {
      const turnCallId = turn.callId || turn.call_id || '';
      if (turnCallId && traceNodeCallId(n) === turnCallId) return true;
      if (n.type === 'assistant' && (turn.rawName === 'spawn_agent' || turn.category === 'agent')) {
        return delta <= 30000 && !isRootTraceNode(n) && (n.name === turn.name || traceNodeCategory(n) === 'agent');
      }
      if (n.type === 'assistant') return false;
      const nodeCommand = primaryCommand(n.detail?.input || {});
      const nodeInputKey = toolInputMatchKey(n.detail?.input || {});
      if (turnCallId) return traceNodeCallId(n) === turnCallId;
      if (turnInputKey && nodeInputKey && turnInputKey === nodeInputKey) {
        return delta <= 30000 && (n.name === turn.name || traceNodeCategory(n) === turn.category);
      }
      if (command) return delta <= 30000 && nodeCommand === command;
      if (delta > 2500) return false;
      return n.name === turn.name;
    }
    if (delta > 2500) return false;
    if (n.type === 'assistant') return false;
    if (turn.role === 'assistant') return n.type === 'llm';
    return false;
  });
  const rowStart = matched ? Number(matched.start || start) : start;
  const duration = matched?.duration || parseWallTimeMs(turn.outputPreview || turn.output) || (turn.kind === 'tool' ? 260 : 900);
  return {
    id: `${turn.kind || turn.role}-${index}`,
    turn,
    start: rowStart,
    duration,
    label: rowStart == null ? '' : traceSeconds(rowStart),
    node: matched,
  };
}

function traceNodeCategory(node) {
  if (node.type === 'llm') return 'model';
  if (node.type === 'assistant') return 'agent';
  if (node.type === 'mcp') return 'mcp';
  if (node.type === 'skill') return 'skill';
  return node.detail?.attributes?.tool?.category || 'tool';
}

function traceNodeSyntheticTurn(node) {
  const detail = node.detail || {};
  const input = detail.input || {};
  const output = detail.output || {};
  const tool = detail.attributes?.tool || {};
  return {
    role: node.type === 'llm' ? 'assistant' : 'tool',
    kind: 'tool',
    synthetic: 'trace-node',
    name: node.name,
    rawName: tool.rawName || node.name,
    category: traceNodeCategory(node),
    callId: traceNodeCallId(node),
    status: node.status || 'completed',
    text: node.preview || '',
    input,
    output,
    outputPreview: output.preview || output.message || output.result || '',
    ts: detail.attributes?.timestamp || '',
  };
}

function traceRowsForUnmatchedNodes(nodes, rows) {
  const matched = new Set(rows.map(row => row.node?.id).filter(Boolean));
  return (nodes || [])
    .filter(node => !isRootTraceNode(node) && !isHiddenTraceNode(node) && !matched.has(node.id))
    .map(node => ({
      id: `trace-node-${node.id}`,
      synthetic: 'trace-node',
      turn: traceNodeSyntheticTurn(node),
      start: Number(node.start || 0),
      duration: Number(node.duration || 0) || 260,
      label: traceSeconds(node.start),
      node,
    }));
}

function actionGroupCategory(nodes) {
  const categories = nodes.map(traceNodeCategory);
  const unique = [...new Set(categories)];
  if (unique.length === 1) return unique[0];
  if (categories.every(c => c === 'shell' || c === 'shell_command' || c === 'exec_command')) return 'shell';
  if (categories.every(c => c === 'edit_file' || c === 'patch' || c === 'write_file')) return 'edit_file';
  return 'tool';
}

function actionGroupName(nodes) {
  const category = actionGroupCategory(nodes);
  const label = actionBucketLabel(category, nodes.length);
  return label;
}

function actionGroupMomentKey(node) {
  const bucket = actionNodeBucket(node);
  const moment = String(Math.round(Number(node.start || 0) / 1000));
  return `${bucket}:${moment}`;
}

function buildActionGroupedRows(rows, nodes) {
  const byParent = new Map();
  for (const node of nodes || []) {
    if (!node.parent) continue;
    const list = byParent.get(node.parent) || [];
    list.push(node);
    byParent.set(node.parent, list);
  }

  const hiddenNodeIds = new Set();
  const groupedRows = [];
  for (const node of nodes || []) {
    if (node.type !== 'llm') continue;
    const actionNodes = (byParent.get(node.id) || []).filter(isGroupableActionTraceNode);
    if (!actionNodes.length) continue;
    actionNodes.forEach(child => hiddenNodeIds.add(child.id));
    const groups = new Map();
    for (const child of actionNodes) {
      const key = actionGroupMomentKey(child);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(child);
    }
    for (const [key, groupNodes] of groups.entries()) {
      const start = Math.min(...groupNodes.map(child => Number(child.start || 0)));
      const end = Math.max(...groupNodes.map(child => Number(child.start || 0) + Number(child.duration || 0)));
      groupedRows.push({
        id: `action-group-${node.id}-${key}`,
        synthetic: 'action-group',
        modelNode: node,
        actionNodes: groupNodes,
        node: groupNodes[0] || node,
        start,
        duration: Math.max(1, end - start),
        label: traceSeconds(start),
        turn: {
          role: 'tool',
          kind: 'tool',
          synthetic: 'action-group',
          name: actionGroupName(groupNodes),
          rawName: 'model_action',
          category: actionGroupCategory(groupNodes),
          status: groupNodes.some(isFailedTraceNode) ? 'error' : 'completed',
          text: groupNodes.map(child => child.preview || child.name).filter(Boolean).join(' · '),
        },
      });
    }
  }

  return [
    ...rows.filter(row => !hiddenNodeIds.has(row.node?.id)),
    ...groupedRows,
  ].sort((a, b) => (Number(a.start || 0) - Number(b.start || 0)) || (rowSortPriority(a) - rowSortPriority(b)));
}

function rowSortPriority(row) {
  if (row.turn?.role === 'user' && row.turn?.kind !== 'tool') return 0;
  if (row.synthetic === 'action-group') return 1.5;
  if (row.node?.type === 'llm') return 1;
  if (row.node?.type === 'assistant') return 2;
  return 3;
}

function isRootTraceNode(node) {
  return !node || !node.parent;
}

function isToolTraceNode(node) {
  return node && (['tool', 'mcp', 'skill'].includes(node.type) || node.detail?.attributes?.tool);
}

function isGroupableActionTraceNode(node) {
  return isToolTraceNode(node) && node.type !== 'assistant';
}

function isFailedTraceNode(node) {
  const status = String(node?.status || '').toLowerCase();
  return ['failed', 'error', 'cancelled'].includes(status);
}

function isNoiseTraceNode(node) {
  return !!node?.detail?.attributes?.noise;
}

function isVisualNoiseTraceNode(node) {
  const attrs = node?.detail?.attributes || {};
  return !!(attrs.noise || attrs.visual_noise);
}

function isHiddenTraceNode(node) {
  return isVisualNoiseTraceNode(node);
}

function traceIntervalDuration(nodes, startMs, endMs, predicate) {
  const from = Math.max(0, Number(startMs || 0));
  const to = Math.max(from, Number(endMs || 0));
  if (to <= from) return 0;
  const intervals = (nodes || [])
    .filter(node => !isNoiseTraceNode(node) && predicate(node))
    .map(node => {
      const start = Math.max(from, Math.min(to, Number(node.start || 0)));
      const end = Math.max(start, Math.min(to, start + Number(node.duration || 0)));
      return [start, end];
    })
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!intervals.length) return 0;
  let total = 0;
  let [curStart, curEnd] = intervals[0];
  for (const [start, end] of intervals.slice(1)) {
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
    } else {
      total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    }
  }
  return total + curEnd - curStart;
}

function traceNodeHasMetricDescendant(node, byParent) {
  const children = byParent.get(node.id) || [];
  for (const child of children) {
    if (Number(child.tokens || 0) > 0 || Number(child.cost || 0) > 0 || Number(child.cacheRead || 0) > 0) {
      return true;
    }
    if (traceNodeHasMetricDescendant(child, byParent)) return true;
  }
  return false;
}

function durationSeverity(durationMs, maxDurationMs = 0) {
  const d = Math.max(0, Number(durationMs) || 0);
  const max = Math.max(1, Number(maxDurationMs) || 0);
  if (d >= 10000 || d >= max * 0.55) return 'red';
  if (d >= 2500 || d >= max * 0.22) return 'yellow';
  return 'green';
}

function durationSeverityClass(durationMs, maxDurationMs) {
  return `severity-${durationSeverity(durationMs, maxDurationMs)}`;
}

function summarizePromptSegment(segment) {
  const byParent = new Map();
  for (const node of segment.nodes) {
    if (!node.parent) continue;
    const list = byParent.get(node.parent) || [];
    list.push(node);
    byParent.set(node.parent, list);
  }
  const stats = {
    wallMs: Math.max(0, segment.endMs - segment.startMs),
    modelMs: 0,
    toolMs: 0,
    modelCalls: 0,
    toolCalls: 0,
    failedTools: 0,
    tokens: 0,
    cost: 0,
    cacheRead: 0,
    topTools: [],
    longestTool: null,
  };
  const toolCounts = new Map();
  for (const node of segment.nodes) {
    if (isNoiseTraceNode(node)) continue;
    const isAggregateAgent = node.type === 'assistant' && !isRootTraceNode(node) && traceNodeHasMetricDescendant(node, byParent);
    if (!isAggregateAgent) {
      stats.tokens += Number(node.tokens || 0);
      stats.cost += Number(node.cost || 0);
      stats.cacheRead += Number(node.cacheRead || 0);
    }
    if (node.type === 'llm' && !isVisualNoiseTraceNode(node)) stats.modelCalls += 1;
    if (isToolTraceNode(node)) {
      stats.toolCalls += 1;
      if (isFailedTraceNode(node)) stats.failedTools += 1;
      const name = displayToolName(node);
      const prev = toolCounts.get(name) || { name, count: 0, durationMs: 0 };
      prev.count += 1;
      prev.durationMs += Number(node.duration || 0);
      toolCounts.set(name, prev);
      if (!stats.longestTool || Number(node.duration || 0) > stats.longestTool.durationMs) {
        stats.longestTool = { name, durationMs: Number(node.duration || 0) };
      }
    }
  }
  stats.topTools = Array.from(toolCounts.values())
    .sort((a, b) => b.durationMs - a.durationMs || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 3);
  stats.modelMs = traceIntervalDuration(segment.nodes, segment.startMs, segment.endMs, node => node.type === 'llm' && !isVisualNoiseTraceNode(node));
  stats.toolMs = traceIntervalDuration(segment.nodes, segment.startMs, segment.endMs, isToolTraceNode);
  return stats;
}

function buildPromptSegments(rows, nodes, totalMs) {
  const userIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.turn.role === 'user' && row.turn.kind !== 'tool');
  if (!userIndexes.length) {
    const segment = {
      id: 'prompt-0',
      index: 1,
      total: 1,
      userRow: rows[0] || null,
      startMs: 0,
      endMs: totalMs,
      rows,
      nodes: (nodes || []).filter(n => !isRootTraceNode(n) && !isNoiseTraceNode(n)),
    };
    segment.stats = summarizePromptSegment(segment);
    segment.severity = durationSeverity(segment.stats.wallMs, segment.stats.wallMs);
    return [segment];
  }
  const nodeEnds = (nodes || [])
    .filter(n => !isRootTraceNode(n))
    .map(n => Number(n.start || 0) + Number(n.duration || 0));
  const maxEnd = Math.max(totalMs, ...nodeEnds, 1000);
  const segments = userIndexes.map(({ row, index }, i) => {
    const next = userIndexes[i + 1];
    const startMs = Math.max(0, Number(row.start || 0));
    const windowEndMs = Math.max(startMs + 1, next ? Number(next.row.start || startMs + 1) : maxEnd);
    const segmentRows = rows.slice(index, next ? next.index : rows.length);
    const segmentNodes = (nodes || []).filter(n => !isRootTraceNode(n) && !isNoiseTraceNode(n) && Number(n.start || 0) >= startMs && Number(n.start || 0) < windowEndMs);
    const endCandidates = [
      ...segmentRows.map(r => Number(r.start || 0) + Number(r.duration || 0)),
      ...segmentNodes.map(n => Number(n.start || 0) + Number(n.duration || 0)),
    ].filter(Number.isFinite);
    const activeEndMs = Math.max(startMs + 1, ...endCandidates);
    const endMs = next ? Math.min(windowEndMs, activeEndMs) : activeEndMs;
    const segment = {
      id: `prompt-${i}`,
      index: i + 1,
      total: userIndexes.length,
      userRow: row,
      startMs,
      endMs,
      rows: segmentRows,
      nodes: segmentNodes,
    };
    segment.stats = summarizePromptSegment(segment);
    return segment;
  });
  const maxWall = Math.max(...segments.map(s => s.stats.wallMs), 1);
  segments.forEach(segment => {
    segment.severity = durationSeverity(segment.stats.wallMs, maxWall);
  });
  return segments;
}

function traceSummaryValue(value, fallback = '—') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

function TracePerformanceStrip({ session }) {
  const s = session.traceSummary || {};
  const cacheHit = s.cacheHitRatio != null ? `${(Number(s.cacheHitRatio) * 100).toFixed(1)}%` : '—';
  const failed = Number(s.failedTools || 0);
  const metrics = [
    ['wall', s.wallTimeMs ? traceSeconds(s.wallTimeMs) : session.duration],
    ['model', `${traceSummaryValue(s.llmCalls, 0)} calls`],
    ['tools', `${traceSummaryValue(s.toolCalls, 0)} calls`],
    ['failed', failed],
    ['cache', cacheHit],
    ['burn', s.costPerMinute != null ? <CostValue value={Number(s.costPerMinute)} suffix="/m" /> : '—'],
  ];
  return (
    <div className="trace-performance-strip">
      {metrics.map(([label, value]) => (
        <div key={label} className={label === 'failed' && failed > 0 ? 'warn' : ''}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      {s.longestTool && (
        <div className="wide">
          <span>slowest</span>
          <strong>{s.longestTool.name} · {traceSeconds(s.longestTool.durationMs)}</strong>
        </div>
      )}
    </div>
  );
}

function segmentNavColor(index) {
  const palette = [
    ['#2dd4bf', 'rgba(45,212,191,0.24)'],
    ['#7dd3fc', 'rgba(125,211,252,0.24)'],
    ['#a78bfa', 'rgba(167,139,250,0.24)'],
    ['#fbbf24', 'rgba(251,191,36,0.24)'],
  ];
  return palette[(Math.max(1, index) - 1) % palette.length];
}

function TraceDurationRail({ segments, totalMs, activeId, onJump }) {
  const railRef = React.useRef(null);
  const [railHeight, setRailHeight] = useStateSD(0);

  React.useEffect(() => {
    const node = railRef.current;
    if (!node) return undefined;
    const update = () => setRailHeight(node.clientHeight || 0);
    update();
    let observer = null;
    if (window.ResizeObserver) {
      observer = new window.ResizeObserver(update);
      observer.observe(node);
    }
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  if (!segments.length) return null;

  const trackInsetPx = 12;
  const trackHeightPx = Math.max(160, (railHeight || 640) - trackInsetPx * 2);
  const desiredGapPx = 8;
  const minGapPx = 4;
  const minSegmentPx = 12;
  const gapPx = segments.length > 1
    ? Math.min(desiredGapPx, Math.max(minGapPx, (trackHeightPx - segments.length * minSegmentPx) / (segments.length - 1)))
    : 0;
  const availableHeightPx = Math.max(segments.length * 4, trackHeightPx - Math.max(0, segments.length - 1) * gapPx);
  const compactMinPx = Math.min(minSegmentPx, availableHeightPx / segments.length);
  const durations = segments.map(segment => Math.max(0, Number(segment.stats?.wallMs || segment.endMs - segment.startMs || 0)));
  const durationTotal = Math.max(1, durations.reduce((sum, duration) => sum + duration, 0));
  const remainingHeightPx = Math.max(0, availableHeightPx - compactMinPx * segments.length);
  const heights = durations.map(duration => compactMinPx + (duration / durationTotal) * remainingHeightPx);

  let cursor = trackInsetPx;
  return (
    <div className="trace-duration-rail" aria-label="time by user input" ref={railRef}>
      {segments.map((segment, index) => {
        const top = Math.min(trackInsetPx + trackHeightPx - 6, cursor);
        const height = Math.max(6, Math.min(trackInsetPx + trackHeightPx - top, heights[index]));
        cursor = top + height + gapPx;
        return (
          <button
            key={segment.id}
            className={`trace-duration-segment ${activeId === segment.id ? 'active' : ''}`}
            style={{ top: `${top}px`, height: `${height}px` }}
            title={`user input ${segment.index}: ${traceSeconds(segment.stats.wallMs)} · $${segment.stats.cost.toFixed(4)} · ${window.formatNum(segment.stats.tokens)} tok`}
            onClick={() => onJump(segment.id)}
          >
            <span>{segment.index}</span>
          </button>
        );
      })}
    </div>
  );
}

function rowOperationLabel(row) {
  if (row.synthetic === 'envelope') return 'user input';
  if (row.synthetic === 'action-group') return row.turn?.name || 'action';
  if (row.node?.type === 'llm') return 'thought';
  const turn = row.turn || {};
  if (turn.kind === 'compression') return 'compression';
  if (turn.kind === 'tool') {
    const label = actionBucketLabel(turn.category || turn.name || turn.rawName || 'tool', 1);
    return label;
  }
  if (turn.role === 'assistant') return 'thought';
  return 'message';
}

function rowTitle(row) {
  if (row.synthetic === 'envelope') return 'turn envelope';
  if (row.synthetic === 'action-group') return row.turn?.name || 'action';
  if (row.node?.type === 'llm') return 'thought';
  const turn = row.turn || {};
  if (turn.kind === 'compression') return turn.text || 'dialogue compression';
  if (turn.kind === 'tool') {
    return turn.name || turn.rawName || rowOperationLabel(row);
  }
  if (turn.role === 'assistant') return 'assistant response';
  return 'user input';
}

function rowInputText(row) {
  if (row.synthetic === 'envelope') return row.turn?.text || row.segment?.userRow?.turn?.text || '';
  if (row.synthetic === 'action-group') return '';
  if (row.node?.type === 'llm') {
    const input = row.node?.detail?.input;
    if (hasValue(input)) return detailPayloadText(input);
  }
  const turn = row.turn || {};
  if (turn.kind === 'tool') {
    const input = turn.input || {};
    const command = primaryCommand(input);
    const file = input.file_path || input.path || input.source_file || input.document_url || input.spreadsheet_url || input.presentation_url;
    if (command) return command;
    if (file) return file;
    if (turn.text) return turn.text;
    if (Object.keys(input).length) return JSON.stringify(input, null, 2);
    return '';
  }
  return turn.text || '';
}

function rowOutputText(row) {
  if (row.synthetic === 'envelope') return '';
  if (row.synthetic === 'action-group') return actionGroupSummary(row);
  if (row.node?.type === 'llm') {
    const output = row.node?.detail?.output;
    if (hasValue(output)) return detailPayloadText(output);
  }
  const turn = row.turn || {};
  if (turn.kind !== 'tool') return '';
  if (turn.outputPreview) return String(turn.outputPreview);
  if (typeof turn.output === 'string') return turn.output;
  if (turn.output) return JSON.stringify(turn.output, null, 2);
  return '';
}

function rowStatus(row) {
  if (row.synthetic === 'envelope') return ['done', 'done'];
  if (row.synthetic === 'action-group') {
    const failed = (row.actionNodes || []).some(isFailedTraceNode);
    if (failed) return ['error', 'error'];
  }
  const status = String(row.node?.status || row.turn?.status || 'completed').toLowerCase();
  if (['failed', 'error', 'cancelled'].includes(status)) return ['error', status];
  if (['called', 'in_progress', 'pending', 'running'].includes(status) || row.node?.live) return ['running', status === 'completed' ? 'running' : status];
  if (row.node?.type === 'assistant' && Number(row.node?.detail?.output?.embedded_trace_nodes || 0) > 0) return ['running', 'agent trace'];
  if (['skipped', 'warning', 'warn'].includes(status)) return ['warn', status];
  return ['done', status === 'completed' ? 'done' : status];
}

function rowSummary(row) {
  if (row.synthetic === 'envelope') return singleLineText(row.turn?.text || 'all work for this user input', 120);
  if (row.synthetic === 'action-group') return singleLineText(actionGroupSummary(row), 120);
  if (row.node?.type === 'llm') {
    const thought = thoughtTextFor(row.node?.detail || {}, row.node);
    if (thought) return singleLineText(thought, 120);
  }
  const input = rowInputText(row);
  if (input) return singleLineText(input, 110);
  const output = rowOutputText(row);
  if (output) return singleLineText(output, 110);
  return rowTitle(row);
}

function rowPreviewLabel(row) {
  if (row.synthetic === 'envelope') return 'user input';
  if (row.synthetic === 'action-group') return 'action';
  if (row.node?.type === 'llm') return 'llm context';
  const turn = row.turn || {};
  if (turn.kind === 'tool') {
    const input = turn.input || {};
    if (primaryCommand(input)) return 'command';
    if (input.file_path || input.path || input.source_file) return 'file';
    return 'input';
  }
  return turn.role || 'message';
}

function rowHierarchyDepth(row) {
  if (row.synthetic === 'envelope') return 0;
  if (row.synthetic === 'action-group') return Math.max(1, Math.min(5, Number(row.modelNode?.depth || 1)));
  if (Number.isFinite(Number(row.node?.depth))) return Math.max(1, Math.min(5, Number(row.node.depth)));
  if (row.turn?.kind === 'tool') return 2;
  if (row.turn?.role === 'assistant') return 1;
  return 1;
}

function traceRowTreeId(row) {
  if (row.synthetic === 'envelope') return row.id;
  if (row.synthetic === 'action-group') return row.id;
  return row.node?.id || row.id;
}

function traceRowParentId(row) {
  if (!row || row.synthetic === 'envelope') return '';
  if (row.synthetic === 'action-group') return row.modelNode?.id || '';
  return row.node?.parent || '';
}

function compareTraceRows(a, b) {
  return (Number(a.start || 0) - Number(b.start || 0)) || (rowSortPriority(a) - rowSortPriority(b));
}

function traceRowChildCounts(rows) {
  const ids = new Set((rows || []).map(traceRowTreeId));
  const counts = new Map();
  for (const row of rows || []) {
    const parentId = traceRowParentId(row);
    if (!parentId || !ids.has(parentId)) continue;
    counts.set(parentId, (counts.get(parentId) || 0) + 1);
  }
  return counts;
}

function orderTraceRowsAsTree(rows, collapsed = new Set()) {
  const safeRows = rows || [];
  const ids = new Set(safeRows.map(traceRowTreeId));
  const childrenByParent = new Map();
  const roots = [];
  for (const row of safeRows) {
    const parentId = traceRowParentId(row);
    if (parentId && ids.has(parentId)) {
      const list = childrenByParent.get(parentId) || [];
      list.push(row);
      childrenByParent.set(parentId, list);
    } else {
      roots.push(row);
    }
  }
  for (const list of childrenByParent.values()) {
    list.sort(compareTraceRows);
  }
  roots.sort(compareTraceRows);

  const ordered = [];
  const seen = new Set();
  const visit = (row) => {
    const id = traceRowTreeId(row);
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(row);
    if (collapsed.has(id)) return;
    for (const child of childrenByParent.get(id) || []) visit(child);
  };
  roots.forEach(visit);
  safeRows.filter(row => !seen.has(traceRowTreeId(row))).sort(compareTraceRows).forEach(visit);
  return ordered;
}

function rowMetricTokens(row, segment) {
  if (row.synthetic === 'envelope') return Number(segment?.stats?.tokens || row.segment?.stats?.tokens || 0);
  if (row.synthetic === 'action-group') return (row.actionNodes || []).reduce((sum, node) => sum + Number(node?.tokens || 0), 0);
  return Number(row.node?.tokens || 0);
}

function rowMetricCost(row, segment) {
  if (row.synthetic === 'envelope') return Number(segment?.stats?.cost || row.segment?.stats?.cost || 0);
  if (row.synthetic === 'action-group') return (row.actionNodes || []).reduce((sum, node) => sum + Number(node?.cost || 0), 0);
  return Number(row.node?.cost || 0);
}

function rowMetricCache(row, segment) {
  if (row.synthetic === 'envelope') return Number(segment?.stats?.cacheRead || row.segment?.stats?.cacheRead || 0);
  if (row.synthetic === 'action-group') return (row.actionNodes || []).reduce((sum, node) => sum + Number(node?.cacheRead || 0), 0);
  return Number(row.node?.cacheRead || 0);
}

function metricPercentiles(values) {
  const sorted = values
    .map(v => Number(v || 0))
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  if (sorted.length < 3) return { low: 0, high: Infinity };
  const low = sorted[Math.max(0, Math.ceil(sorted.length * 0.2) - 1)];
  const high = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))];
  return { low, high };
}

function metricTone(value, scale) {
  const amount = Number(value || 0);
  if (!(amount > 0)) return 'metric-empty';
  if (!scale || scale.high === scale.low) return 'metric-mid';
  if (amount >= scale.high) return 'metric-high';
  if (amount <= scale.low) return 'metric-low';
  return 'metric-mid';
}

function segmentEnvelopeRow(segment) {
  const duration = Math.max(1, Number(segment.endMs || 0) - Number(segment.startMs || 0));
  return {
    id: `${segment.id}-envelope`,
    synthetic: 'envelope',
    segment,
    turn: {
      role: 'user',
      kind: 'envelope',
      text: segment.userRow?.turn?.text || 'session start',
      ts: segment.userRow?.turn?.ts,
    },
    start: segment.startMs,
    duration,
    label: '0%',
    node: null,
  };
}

function segmentDetailRows(segment, collapsedTraceRows = new Set()) {
  if (!segment) return [];
  const rows = (segment.rows || []).filter(row => !(row.turn.role === 'user' && row.turn.kind !== 'tool'));
  return orderTraceRowsAsTree(rows, collapsedTraceRows);
}

function spanTimingForRow(row, segment) {
  const segmentDuration = Math.max(1, Number(segment.endMs || 0) - Number(segment.startMs || 0));
  const relativeStartMs = Math.max(0, Number(row.start || 0) - Number(segment.startMs || 0));
  const rowDuration = Math.max(0, Number(row.duration || 0));
  const left = Math.max(0, Math.min(98, (relativeStartMs / segmentDuration) * 100));
  const width = Math.max(0.8, Math.min(100 - left, (rowDuration / segmentDuration) * 100));
  return { segmentDuration, relativeStartMs, rowDuration, left, width };
}

function actionNodeInputText(node) {
  const input = node?.detail?.input || {};
  const command = primaryCommand(input);
  const file = input.file_path || input.path || input.source_file || input.document_url || input.spreadsheet_url || input.presentation_url;
  const preview = input.input_preview || input.content_preview || input.old_string_preview || input.new_string_preview || input.text || '';
  if (command) return command;
  if (file && preview) return `${file}\n\n${preview}`;
  if (file) return file;
  if (preview) return String(preview);
  return detailPayloadText(input);
}

function actionNodeOutputText(node) {
  const output = node?.detail?.output || {};
  return tracePayloadText(output, node?.preview || '');
}

function generatedToolCallsForOutput(output) {
  const calls = output && typeof output === 'object' && Array.isArray(output.tool_calls)
    ? output.tool_calls
    : [];
  return calls.filter(Boolean);
}

function generatedToolCallName(call) {
  const fn = call?.function && typeof call.function === 'object' ? call.function : {};
  return call?.name || call?.raw_name || fn.name || call?.type || 'tool';
}

function generatedToolCallInput(call) {
  if (!call || typeof call !== 'object') return call;
  const fn = call.function && typeof call.function === 'object' ? call.function : {};
  if (hasValue(call.input)) return call.input;
  if (hasValue(call.arguments)) return call.arguments;
  if (hasValue(fn.arguments)) return fn.arguments;
  if (hasValue(call.action)) return call.action;

  const fallback = { ...call };
  ['name', 'raw_name', 'category', 'call_id', 'id', 'timestamp', 'type', 'function'].forEach(key => delete fallback[key]);
  return Object.keys(fallback).length ? fallback : '';
}

function generatedToolCallText(call) {
  const input = generatedToolCallInput(call);
  const command = primaryCommand(input);
  const file = input.file_path || input.path || input.source_file || input.document_url || input.spreadsheet_url || input.presentation_url;
  const preview = input.input_preview || input.content_preview || input.old_string_preview || input.new_string_preview || '';
  const head = generatedToolCallName(call);
  if (command) return `${head}\n${command}`;
  if (file && preview) return `${head}\n${file}\n\n${preview}`;
  if (file) return `${head}\n${file}`;
  if (preview) return `${head}\n${preview}`;
  return `${head}\n${detailPayloadText(input)}`;
}

function GeneratedToolCallsBlock({ calls }) {
  const entries = (calls || []).map((call, index) => {
    const name = generatedToolCallName(call);
    const category = call?.category || contextToolCategory(name);
    const text = generatedToolCallText(call);
    return {
      call,
      category,
      id: call?.call_id || call?.id || '',
      name,
      text,
      index,
    };
  }).filter(entry => entry.text);
  if (!entries.length) return null;

  const categories = [...new Set(entries.map(entry => entry.category).filter(Boolean))];
  const category = categories.length === 1 ? categories[0] : 'tool';
  const Icon = category === 'shell'
    ? window.Icon.Terminal
    : category === 'browser'
      ? window.Icon.Globe
      : category === 'agent'
        ? window.Icon.Brain
        : window.Icon.Tool || window.Icon.File;
  const combined = entries.map(entry => {
    const callId = entry.id ? ` · ${entry.id}` : '';
    if (entries.length === 1) return entry.text;
    const body = entry.text.startsWith(`${entry.name}\n`)
      ? entry.text.slice(entry.name.length + 1)
      : entry.text;
    return `${entry.index + 1}. ${entry.name}${callId}\n${body}`;
  }).join('\n\n');
  const label = categories.length === 1
    ? actionBucketLabel(category, entries.length)
    : `generated calls ×${entries.length}`;
  return (
    <div className={`action-flat-bucket ${operationClassForCategory(category)}`}>
      <div className="action-flat-head">
        <Icon size={18} />
        <span>{label}</span>
        <em>{categories.length === 1 ? 'generated calls' : `${categories.length} types`}</em>
      </div>
      {category === 'shell' ? (
        <div className="shell-command-frame">
          <CodeSnippet text={combined} shell maxChars={4200} maxLines={34} />
        </div>
      ) : (
        <CodeSnippet text={combined} maxChars={4200} maxLines={34} />
      )}
    </div>
  );
}

function actionGroupThoughtText(row) {
  const output = row.modelNode?.detail?.output || {};
  const direct = output.thoughts || output.reasoning_summary || output.message || '';
  if (direct) return String(direct);
  const calls = generatedToolCallsForOutput(output);
  if (calls.length) return calls.map(generatedToolCallText).join('\n\n');
  return row.modelNode?.preview || '';
}

function actionGroupSummary(row) {
  const parts = (row.actionNodes || [])
    .map(node => actionNodeInputText(node) || node.preview || node.name)
    .filter(Boolean);
  return parts.join(' · ') || actionGroupThoughtText(row) || rowTitle(row);
}

function actionNodeBucket(node) {
  const category = traceNodeCategory(node);
  const rawName = String(node?.detail?.attributes?.tool?.rawName || node?.name || '').toLowerCase();
  if (category === 'shell' || category === 'shell_command' || category === 'exec_command') return 'shell';
  if (category === 'edit_file' || category === 'patch' || category === 'write_file') return 'edit_file';
  if (category === 'web' || category === 'web_search' || category === 'web_fetch') return 'browser';
  if (rawName.includes('chrome') || rawName.includes('browser') || rawName.includes('playwright')) return 'browser';
  if (['new_page', 'take_snapshot', 'list_console_messages', 'evaluate_script', 'click', 'hover', 'fill', 'fill_form'].some(name => rawName.includes(name))) return 'browser';
  return category || node.name || 'tool';
}

function actionBucketLabel(category, count) {
  const raw = String(category || 'tool');
  let label = raw === 'edit_file' ? 'edit file' : raw.replace(/_/g, ' ');
  if (label === 'shell command' || label === 'exec command') label = 'shell';
  if (label === 'web' || label === 'web search' || label === 'web fetch') label = 'browser';
  return count > 1 ? `${label} ×${count}` : label;
}

function displayToolName(node) {
  const category = actionNodeBucket(node);
  if (category === 'shell' || category === 'browser' || category === 'edit_file') {
    return actionBucketLabel(category, 1);
  }
  return node?.name || actionBucketLabel(category, 1);
}

function actionBuckets(nodes) {
  const buckets = [];
  const byKey = new Map();
  for (const node of nodes || []) {
    const key = actionNodeBucket(node);
    if (!byKey.has(key)) {
      const bucket = { key, category: key, nodes: [] };
      byKey.set(key, bucket);
      buckets.push(bucket);
    }
    byKey.get(key).nodes.push(node);
  }
  return buckets;
}

function ActionToolBucket({ bucket }) {
  const Icon = (bucket.category === 'shell'
    ? window.Icon.Terminal
    : bucket.category === 'browser'
      ? window.Icon.Globe
      : window.Icon.File) || window.Icon.File;
  const entries = bucket.nodes.map((node, index) => {
    const input = node.detail?.input || {};
    const inputText = actionNodeInputText(node);
    const outputText = actionNodeOutputText(node);
    const isPatch = looksLikeDiff(inputText || outputText);
    return {
      node,
      input,
      inputText,
      outputText,
      isPatch,
      label: displayToolName(node),
      meta: `${traceSeconds(node.start)} · ${traceSeconds(node.duration)}`,
      index,
    };
  });
  const shell = bucket.category === 'shell';
  const combinedInput = entries
    .map(entry => {
      const text = entry.inputText || detailPayloadText(entry.input);
      if (!text) return '';
      if (entries.length === 1) return text;
      return shell ? `$ ${text}` : `${entry.index + 1}. ${entry.label}\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const combinedOutput = entries
    .map(entry => {
      if (!entry.outputText) return '';
      if (entries.length === 1) return String(entry.outputText);
      return `${entry.index + 1}. ${entry.label} · ${entry.meta}\n${entry.outputText}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const forceDiff = entries.some(entry => entry.isPatch);
  return (
    <div className={`action-flat-bucket ${operationClassForCategory(bucket.category)}`}>
      <div className="action-flat-head">
        <Icon size={18} />
        <span>{actionBucketLabel(bucket.category, bucket.nodes.length)}</span>
        <em>{bucket.nodes.map(node => traceSeconds(node.duration)).join(' · ')}</em>
      </div>
      {combinedInput ? (
        shell && !forceDiff ? (
          <div className="shell-command-frame">
            <CodeSnippet text={combinedInput} shell maxChars={4200} maxLines={34} />
          </div>
        ) : (
          <CodeSnippet text={combinedInput} forceDiff={forceDiff} maxChars={4200} maxLines={34} />
        )
      ) : (
        <div className="trace-empty-detail">no input recorded</div>
      )}
      {combinedOutput ? (
        <details className="action-flat-output" open={entries.length === 1}>
          <summary>tool output</summary>
          <CodeSnippet text={combinedOutput} forceDiff={forceDiff} maxChars={4200} maxLines={34} />
        </details>
      ) : (
        <div className="trace-empty-detail">no tool output recorded</div>
      )}
    </div>
  );
}

function ActionGroupOutput({ row }) {
  const buckets = actionBuckets(row.actionNodes || []);
  return (
    <div className="ls-llm-output-stack action-output-stack">
      {buckets.map(bucket => <ActionToolBucket key={bucket.key} bucket={bucket} />)}
    </div>
  );
}

function ThoughtOutput({ row }) {
  const node = row.node || row.modelNode;
  const output = node?.detail?.output || {};
  const thought = thoughtTextFor(node?.detail || {}, node || {});
  const calls = generatedToolCallsForOutput(output);
  return (
    <div className="ls-llm-output-stack action-output-stack">
      <div className="ls-primary-block thoughts">
        <div className="ls-primary-kicker">
          <window.Icon.Brain size={13} /> thought
          {node?.id && <span>{node.id}</span>}
        </div>
        {thought ? (
          <CodeSnippet text={String(thought)} maxChars={3600} maxLines={36} />
        ) : (
          <div className="trace-empty-detail">no thought recorded</div>
        )}
      </div>
      <GeneratedToolCallsBlock calls={calls} />
    </div>
  );
}

function previousContextPayload(row) {
  if (row.node?.type === 'llm') return row.node?.detail?.input || null;
  return null;
}

function contextToolCategory(name) {
  const raw = String(name || '').toLowerCase();
  if (raw.includes('exec_command') || raw.includes('write_stdin') || raw === 'bash') return 'shell';
  if (raw.includes('apply_patch') || raw.includes('edit') || raw.includes('write_file')) return 'edit_file';
  if (raw.includes('chrome') || raw.includes('browser') || raw.includes('playwright') || raw.startsWith('web_')) return 'browser';
  if (raw.startsWith('mcp__')) return 'mcp';
  if (raw.includes('spawn_agent') || raw.includes('wait_agent')) return 'agent';
  return 'tool';
}

function contextToolInputText(input) {
  if (!input || typeof input !== 'object') return detailPayloadText(input);
  const value = input.arguments || input.input || input;
  if (value && typeof value === 'object') return actionNodeInputText({ detail: { input: value } });
  return detailPayloadText(value);
}

function contextOutputText(value) {
  if (!hasValue(value)) return '';
  if (typeof value === 'string') return value;
  return tracePayloadText(value, detailPayloadText(value));
}

function contextBlocksFromInput(value) {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const messages = Array.isArray(obj.messages) ? obj.messages : [];
  const outputs = new Map();
  for (const msg of messages) {
    const type = msg.type || '';
    if (msg.role === 'tool' || type === 'function_call_output' || type === 'custom_tool_call_output') {
      const callId = msg.call_id || msg.tool_call_id || msg.id || '';
      if (callId) outputs.set(callId, msg.output || msg.result || msg.content || '');
    }
  }
  const blocks = [];
  const addBlock = (block) => {
    const prev = blocks[blocks.length - 1];
    if (block.kind === 'tool' && prev?.kind === 'tool' && prev.category === block.category && prev.timestamp === block.timestamp) {
      prev.entries.push(...block.entries);
      prev.title = actionBucketLabel(block.category, prev.entries.length);
      return;
    }
    blocks.push(block);
  };

  const instructions = Array.isArray(obj.instructions) ? obj.instructions : [];
  for (const instruction of instructions) {
    const text = detailPayloadText(instruction.content || instruction);
    if (text) addBlock({ kind: 'system', title: instruction.role || 'instructions', text, timestamp: '' });
  }

  for (const msg of messages) {
    const type = msg.type || '';
    if (msg.role === 'tool' || type === 'function_call_output' || type === 'custom_tool_call_output') continue;
    const timestamp = msg.timestamp || '';
    if (Array.isArray(msg.tool_calls)) {
      for (const call of msg.tool_calls) {
        const rawName = generatedToolCallName(call);
        const category = contextToolCategory(rawName);
        const callId = call?.call_id || call?.id || '';
        const input = generatedToolCallInput(call);
        addBlock({
          kind: 'tool',
          category,
          title: actionBucketLabel(category, 1),
          timestamp,
          entries: [{
            name: actionBucketLabel(category, 1),
            rawName,
            input,
            inputText: contextToolInputText(input),
            outputText: contextOutputText(outputs.get(callId)),
            timestamp,
          }],
        });
      }
    }
    if (type === 'function_call' || type === 'custom_tool_call' || type === 'web_search_call') {
      const rawName = msg.name || type || 'tool';
      const category = contextToolCategory(rawName);
      const callId = msg.call_id || msg.tool_call_id || msg.id || '';
      addBlock({
        kind: 'tool',
        category,
        title: actionBucketLabel(category, 1),
        timestamp,
        entries: [{
          name: actionBucketLabel(category, 1),
          rawName,
          input: msg.arguments || msg.input || {},
          inputText: contextToolInputText(msg.arguments || msg.input || {}),
          outputText: contextOutputText(outputs.get(callId)),
          timestamp,
        }],
      });
      continue;
    }
    const text = msg.content || msg.message || msg.text || '';
    if (!text) continue;
    if (msg.role === 'user') {
      addBlock({ kind: 'user', title: 'user input', text: String(text), timestamp });
    } else if (msg.role === 'assistant' || type === 'reasoning') {
      addBlock({ kind: 'thought', title: 'thought', text: String(text), timestamp });
    } else {
      addBlock({ kind: 'system', title: msg.role || 'context', text: String(text), timestamp });
    }
  }
  return blocks;
}

function ContextToolBlock({ block }) {
  const Icon = (block.category === 'shell'
    ? window.Icon.Terminal
    : block.category === 'browser'
      ? window.Icon.Globe
      : window.Icon.File) || window.Icon.File;
  const shell = block.category === 'shell';
  const combinedInput = block.entries
    .map((entry, index) => {
      const text = entry.inputText || contextToolInputText(entry.input);
      if (!text) return '';
      if (block.entries.length === 1) return text;
      return shell ? `$ ${text}` : `${index + 1}. ${entry.name}\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const combinedOutput = block.entries
    .map((entry, index) => {
      if (!entry.outputText) return '';
      if (block.entries.length === 1) return entry.outputText;
      return `${index + 1}. ${entry.name}\n${entry.outputText}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const forceDiff = looksLikeDiff(combinedInput || combinedOutput);
  return (
    <div className={`action-flat-bucket context-tool-block ${operationClassForCategory(block.category)}`}>
      <div className="action-flat-head">
        <Icon size={18} />
        <span>{actionBucketLabel(block.category, block.entries.length)}</span>
        {block.timestamp && <em>{new Date(block.timestamp).toLocaleTimeString()}</em>}
      </div>
      {combinedInput ? (
        shell && !forceDiff ? (
          <div className="shell-command-frame">
            <CodeSnippet text={combinedInput} shell maxChars={3600} maxLines={30} />
          </div>
        ) : (
          <CodeSnippet text={combinedInput} forceDiff={forceDiff} maxChars={3600} maxLines={30} />
        )
      ) : (
        <div className="trace-empty-detail">no input recorded</div>
      )}
      {combinedOutput && (
        <div className="context-tool-output">
          <div className="context-tool-output-title">{block.entries.length > 1 ? `tool output ×${block.entries.length}` : 'tool output'}</div>
          <CodeSnippet text={combinedOutput} forceDiff={forceDiff} maxChars={2600} maxLines={24} />
        </div>
      )}
    </div>
  );
}

function ContextInputBlocks({ value }) {
  const blocks = contextBlocksFromInput(value);
  if (!blocks.length) {
    return hasValue(value)
      ? <CodeSnippet text={detailPayloadText(value)} maxChars={3600} maxLines={34} />
      : <div className="trace-empty-detail">no llm context recorded</div>;
  }
  return (
    <div className="ls-llm-output-stack action-output-stack context-input-stack">
      {blocks.map((block, index) => {
        if (block.kind === 'tool') return <ContextToolBlock key={`${block.kind}-${block.timestamp}-${index}`} block={block} />;
        const isThought = block.kind === 'thought';
        const isUser = block.kind === 'user';
        return (
          <div key={`${block.kind}-${block.timestamp}-${index}`} className={`ls-primary-block ${isThought ? 'thoughts' : isUser ? 'user-request' : 'output'}`}>
            <div className="ls-primary-kicker">
              {isThought ? <window.Icon.Brain size={13} /> : isUser ? <window.Icon.Sessions size={13} /> : <window.Icon.File size={13} />}
              {block.title}
              {block.timestamp && <span>{new Date(block.timestamp).toLocaleTimeString()}</span>}
            </div>
            <CodeSnippet text={block.text} maxChars={2600} maxLines={28} />
          </div>
        );
      })}
    </div>
  );
}

function SpanRowDetails({ row }) {
  const input = rowInputText(row);
  const output = rowOutputText(row);
  const isPatch = looksLikeDiff(input || output);
  const hasMeta = row.node || row.turn?.input;
  return (
    <div className="trace-span-details">
      <div className="trace-span-detail-grid">
        <div className="trace-span-detail-card">
          <div className="trace-span-detail-head">
            <span>{rowPreviewLabel(row)}</span>
            {row.turn?.rawName && <em>{row.turn.rawName}</em>}
          </div>
          {input ? <CodeSnippet text={input} shell={!isPatch && row.turn?.category === 'shell'} forceDiff={isPatch} maxChars={1800} maxLines={18} /> : <div className="trace-empty-detail">no input recorded</div>}
        </div>
        <div className="trace-span-detail-card">
          <div className="trace-span-detail-head">
            <span>output</span>
            {row.node?.duration != null && <em>{traceSeconds(row.node.duration)}</em>}
          </div>
          {output ? <CodeSnippet text={output} maxChars={1800} maxLines={18} /> : <div className="trace-empty-detail">no output recorded</div>}
        </div>
      </div>
      {hasMeta && (
        <div className="trace-span-meta-line">
          {row.node?.id && <span>span {row.node.id}</span>}
          {row.node?.tokens > 0 && <span>{window.formatNum(row.node.tokens)} tokens</span>}
          {row.node?.cacheRead > 0 && <span>{window.formatNum(row.node.cacheRead)} cache</span>}
          {row.node?.cost > 0 && <span><CostValue value={row.node.cost} /></span>}
        </div>
      )}
    </div>
  );
}

function TraceSpanDetailPanel({ selection, onClose }) {
  if (!selection) {
    return (
      <aside className="trace-detail-panel empty">
        <div className="trace-detail-empty">
          <span>span details</span>
          <strong>Select a command</strong>
          <p>Click a span in the waterfall to inspect its properties, input, output, tokens, and cost.</p>
        </div>
      </aside>
    );
  }

  const { row, segment } = selection;
  const opClass = operationClassForTurn(row.turn);
  const [statusClass, statusLabel] = rowStatus(row);
  const input = rowInputText(row);
  const output = rowOutputText(row);
  const isPatch = looksLikeDiff(input || output);
  const isActionGroup = row.synthetic === 'action-group';
  const isThoughtRow = row.node?.type === 'llm' && !isActionGroup;
  const previousContext = previousContextPayload(row);
  const timing = spanTimingForRow(row, segment);
  const tokens = rowMetricTokens(row, segment);
  const cost = rowMetricCost(row, segment);
  const cache = rowMetricCache(row, segment);
  return (
    <aside className={`trace-detail-panel ${opClass}`}>
      <div className="trace-detail-top">
        <div className="trace-detail-title">
          <span className={`trace-span-type ${opClass}`}>{rowOperationLabel(row)}</span>
          <h3>{rowTitle(row)}</h3>
          <p>{rowSummary(row)}</p>
        </div>
        <button className="ls-icon-button" title="close details" onClick={onClose}>
          <window.Icon.X size={13} />
        </button>
      </div>

      <div className="trace-detail-summary">
        <span className={`trace-span-status ${statusClass}`}>{statusLabel}</span>
        <span>{traceSeconds(timing.rowDuration)}</span>
        <span>{tokens > 0 ? `${window.formatNum(tokens)} tok` : '0 tok'}</span>
        {cache > 0 && <span>{window.formatNum(cache)} cache</span>}
        <span>{cost > 0 ? <CostValue value={cost} /> : '$0'}</span>
      </div>

      {isThoughtRow ? (
        <details className="trace-detail-section">
          <summary>{rowPreviewLabel(row)}</summary>
          {previousContext ? (
            <ContextInputBlocks value={previousContext} />
          ) : (
            <div className="trace-empty-detail">no llm context recorded</div>
          )}
        </details>
      ) : !isActionGroup && (
        <details className="trace-detail-section" open>
          <summary>{rowPreviewLabel(row)}</summary>
          {input ? (
            <CodeSnippet text={input} shell={!isPatch && row.turn?.category === 'shell'} forceDiff={isPatch} maxChars={3200} maxLines={28} />
          ) : (
            <div className="trace-empty-detail">no input recorded</div>
          )}
        </details>
      )}

      <details className="trace-detail-section" open>
        <summary>{isThoughtRow ? 'Thought' : isActionGroup ? 'Action output' : 'Output'}</summary>
        {isActionGroup ? (
          <ActionGroupOutput row={row} />
        ) : isThoughtRow ? (
          <ThoughtOutput row={row} />
        ) : output ? (
          <CodeSnippet text={output} maxChars={3200} maxLines={28} />
        ) : (
          <div className="trace-empty-detail">no output recorded</div>
        )}
      </details>
    </aside>
  );
}

function SpanWaterfallRow({ row, segment, selected, onSelect, hasChildren = false, collapsed = false, onToggleCollapse, metricScale }) {
  const opClass = operationClassForTurn(row.turn);
  const [statusClass, statusLabel] = rowStatus(row);
  const timing = spanTimingForRow(row, segment);
  const depth = rowHierarchyDepth(row);
  const tokens = rowMetricTokens(row, segment);
  const cost = rowMetricCost(row, segment);
  const tokenTone = metricTone(tokens, metricScale?.tokens);
  const costTone = metricTone(cost, metricScale?.cost);
  return (
    <div
      className={`trace-span-wrap ${selected ? 'selected' : ''} ${opClass} depth-${depth} ${row.synthetic === 'envelope' ? 'envelope' : ''} ${row.synthetic === 'action-group' ? 'action-group' : ''}`}
      style={{ '--span-depth': depth }}
    >
      <div
        className="trace-span-row"
        onClick={onSelect}
      >
        <span className="trace-span-tree">
          {depth > 0 && <span className="trace-span-branch" aria-hidden="true" />}
          {hasChildren ? (
            <button
              type="button"
              className="trace-span-expander"
              title={collapsed ? 'expand trace block' : 'collapse trace block'}
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapse?.();
              }}
            >
              {collapsed ? <window.Icon.ChevronRight size={12} /> : <window.Icon.ChevronDown size={12} />}
            </button>
          ) : (
            <span className="trace-span-expander placeholder" aria-hidden="true" />
          )}
          <span className={`trace-span-type ${opClass}`}>{rowOperationLabel(row)}</span>
        </span>
        <span className="trace-span-start">+{traceSeconds(timing.relativeStartMs)}</span>
        <span className="trace-span-duration">{traceSeconds(timing.rowDuration)}</span>
        <span className="trace-span-waterfall" aria-hidden="true">
          <span className="trace-span-gridline one" />
          <span className="trace-span-gridline two" />
          <span className="trace-span-gridline three" />
          <span className={`trace-span-bar ${opClass}`} style={{ left: `${timing.left}%`, width: `${timing.width}%` }} />
        </span>
        <span className="trace-span-activity" title={rowSummary(row)}>
          {rowSummary(row)}
        </span>
        <span className={`trace-span-status ${statusClass}`}>{statusLabel}</span>
        <span className={`trace-span-tokens ${tokenTone}`}>{tokens > 0 ? window.formatNum(tokens) : ''}</span>
        <span className={`trace-span-cost ${costTone}`}>{cost > 0 ? <CostValue value={cost} /> : ''}</span>
      </div>
    </div>
  );
}

function PromptSegmentBlock({ segment, open, onToggle, markerRef, selectedCommandId, onSelectCommand, collapsedTraceRows = new Set(), onToggleTraceRow, metricScale }) {
  const stats = segment.stats;
  const userText = segment.userRow?.turn?.text || 'session start';
  const userTime = segment.userRow?.turn?.ts ? new Date(segment.userRow.turn.ts).toLocaleString() : '';
  const topTools = stats.topTools.map(t => `${t.name} ${t.count}x`).join(' · ');
  const [accent, glow] = segmentNavColor(segment.index);
  const childCounts = traceRowChildCounts((segment.rows || []).filter(row => !(row.turn.role === 'user' && row.turn.kind !== 'tool')));
  const detailRows = segmentDetailRows(segment, collapsedTraceRows);
  return (
    <section ref={markerRef} className={`prompt-segment duration-${segment.severity}`} style={{ '--segment-accent': accent, '--segment-glow': glow }}>
      <button className="prompt-segment-head" onClick={onToggle}>
        <span className="prompt-segment-meta">
          <span className="prompt-segment-kicker">
            <window.Icon.Sessions size={12} /> user input {segment.index} / {segment.total}
          </span>
          {userTime && <time>{userTime}</time>}
          <span className="prompt-segment-stats">
            <em>{traceSeconds(stats.wallMs)}</em>
            <em><CostValue value={stats.cost} /></em>
            <em>{window.formatNum(stats.tokens)} tok</em>
            <em>{stats.toolCalls} tools</em>
            {stats.failedTools > 0 && <em className="danger">{stats.failedTools} failed</em>}
          </span>
          <span className="prompt-segment-toggle">{open ? 'hide' : 'show'}</span>
        </span>
        <span className="prompt-segment-message" title={userText}>
          {singleLineText(userText, 220)}
        </span>
      </button>
      <div className="prompt-segment-subline">
        <span>{stats.modelCalls} model calls</span>
        <span>{traceSeconds(stats.toolMs)} tool time</span>
        {stats.longestTool && <span>slowest {stats.longestTool.name} · {traceSeconds(stats.longestTool.durationMs)}</span>}
        {topTools && <span>{topTools}</span>}
      </div>
      {open && detailRows.length > 0 && (
        <div className="prompt-segment-body trace-span-table">
          <div className="trace-span-table-head">
            <span>span</span>
            <span>start</span>
            <span>duration</span>
            <span className="trace-span-waterfall-scale">
              <em>0%</em>
              <em>25%</em>
              <em>50%</em>
              <em>75%</em>
              <em>100%</em>
            </span>
            <span className="trace-span-activity">activity</span>
            <span>status</span>
            <span>tokens</span>
            <span>cost</span>
          </div>
          {detailRows.map(row => (
            (() => {
              const treeId = traceRowTreeId(row);
              const hasChildren = (childCounts.get(treeId) || 0) > 0;
              return (
                <SpanWaterfallRow
                  key={row.id}
                  row={row}
                  segment={segment}
                  selected={selectedCommandId === row.id}
                  onSelect={() => onSelectCommand(row.id)}
                  hasChildren={hasChildren}
                  collapsed={collapsedTraceRows.has(treeId)}
                  onToggleCollapse={() => onToggleTraceRow(treeId)}
                  metricScale={metricScale}
                />
              );
            })()
          ))}
        </div>
      )}
    </section>
  );
}

function CombinedTraceView({ session, trace, onCopyDialogue, copiedDialogue }) {
  const shellRef = React.useRef(null);
  const runListRef = React.useRef(null);
  const markerRefs = React.useRef({});
  const [detailWidth, setDetailWidth] = useStateSD(() => {
    const saved = Number(window.localStorage?.getItem('tracebook.trace.detailWidth') || 0);
    return saved > 0 ? saved : 430;
  });
  const [waterfallCollapsed, setWaterfallCollapsed] = useStateSD(() => window.localStorage?.getItem('tracebook.trace.waterfallCollapsed') === '1');
  const detail = window._SESSION_DETAIL || {};
  const turns = compactTranscript(detail.transcript || []).filter(visibleTranscriptTurn);
  const originMs = detail.trace?.originAt ? new Date(detail.trace.originAt).getTime() : (detail.startedAt ? new Date(detail.startedAt).getTime() : NaN);
  const nodes = trace.nodes || [];
  const fallbackTotal = (() => {
    const times = turns.map(t => t.ts ? new Date(t.ts).getTime() : NaN).filter(Number.isFinite);
    if (!times.length || !Number.isFinite(originMs)) return 1000;
    return Math.max(1000, Math.max(...times) - originMs + 1000);
  })();
  const totalMs = Math.max(trace.totalDuration || 0, fallbackTotal, 1000);
  const transcriptRows = turns.map((turn, index) => turnTimelineRow(turn, index, originMs, totalMs, nodes));
  const rawRows = [...transcriptRows, ...traceRowsForUnmatchedNodes(nodes, transcriptRows)]
    .sort((a, b) => (Number(a.start || 0) - Number(b.start || 0)) || (rowSortPriority(a) - rowSortPriority(b)));
  const rows = buildActionGroupedRows(rawRows, nodes);
  const segments = buildPromptSegments(rows, nodes, totalMs);
  const [activeSegmentId, setActiveSegmentId] = useStateSD(null);
  const [openSegments, setOpenSegments] = useStateSD(() => new Set(segments[0] ? [segments[0].id] : []));
  const [selectedCommandId, setSelectedCommandId] = useStateSD(null);
  const [collapsedTraceRows, setCollapsedTraceRows] = useStateSD(new Set());
  const activeSegment = segments.find(segment => segment.id === activeSegmentId) || segments[0];
  const metricEntries = segments.flatMap(segment => segmentDetailRows(segment).map(row => ({ row, segment })));
  const metricScale = {
    tokens: metricPercentiles(metricEntries.map(({ row, segment }) => rowMetricTokens(row, segment))),
    cost: metricPercentiles(metricEntries.map(({ row, segment }) => rowMetricCost(row, segment))),
  };
  const selectableRows = segments.flatMap(segment => segmentDetailRows(segment, collapsedTraceRows).map(row => ({ row, segment })));
  const selectedEntry = selectableRows.find(entry => entry.row.id === selectedCommandId) || null;

  React.useEffect(() => {
    markerRefs.current = {};
    setActiveSegmentId(segments[0]?.id || null);
    setOpenSegments(new Set(segments[0] ? [segments[0].id] : []));
    setSelectedCommandId(null);
    setCollapsedTraceRows(new Set());
  }, [session.id, rows.length]);

  React.useEffect(() => {
    if (!activeSegmentId && segments[0]) setActiveSegmentId(segments[0].id);
  }, [segments.length]);

  React.useEffect(() => {
    setOpenSegments(prev => {
      if (prev.size || !segments[0]) return prev;
      return new Set([segments[0].id]);
    });
  }, [segments.length]);

  const updateActiveSegmentFromScroll = () => {
    const list = runListRef.current;
    if (!list || !segments.length) return;
    const top = list.getBoundingClientRect().top + 8;
    let current = segments[0];
    for (const segment of segments) {
      const marker = markerRefs.current[segment.id];
      if (marker && marker.getBoundingClientRect().top <= top) current = segment;
    }
    setActiveSegmentId(current.id);
  };

  const jumpToSegment = (id) => {
    setActiveSegmentId(id);
    setOpenSegments(prev => new Set([...prev, id]));
    requestAnimationFrame(() => {
      markerRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const toggleSegment = (id) => {
    setOpenSegments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSegments = () => {
    setOpenSegments(prev => {
      if (segments.length && prev.size === segments.length) return new Set();
      return new Set(segments.map(segment => segment.id));
    });
  };

  const toggleWaterfall = () => {
    setWaterfallCollapsed(prev => {
      const next = !prev;
      window.localStorage?.setItem('tracebook.trace.waterfallCollapsed', next ? '1' : '0');
      return next;
    });
  };

  const selectCommand = (id) => {
    setSelectedCommandId(id);
  };

  const toggleTraceRow = (id) => {
    setCollapsedTraceRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startDetailResize = (event) => {
    const shell = shellRef.current;
    if (!shell) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch (_) {
      // Pointer capture is best-effort across browsers.
    }
    const rect = shell.getBoundingClientRect();
    const minLeft = 520;
    const minRight = 320;
    const railWidth = 38;
    const splitterWidth = 8;
    const maxRight = Math.max(minRight, rect.width - railWidth - splitterWidth - minLeft);
    const onMove = (moveEvent) => {
      const next = Math.max(minRight, Math.min(maxRight, rect.right - moveEvent.clientX));
      setDetailWidth(next);
      window.localStorage?.setItem('tracebook.trace.detailWidth', String(Math.round(next)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  return (
    <div className="trace-waterfall-frame">
      <div className="trace-waterfall-menu">
        <div className="trace-waterfall-menu-title">
          <span>Trace</span>
          <em>{segments.length} user inputs · {rows.length} spans</em>
        </div>
        <div className="ls-trace-tools">
          <button className="ls-icon-button" title="copy dialogue" onClick={onCopyDialogue}>
            <window.Icon.Copy size={14} />
          </button>
          <button
            className={`pill trace-waterfall-toggle ${waterfallCollapsed ? '' : 'active'}`}
            onClick={toggleWaterfall}
            title={waterfallCollapsed ? 'show waterfall' : 'hide waterfall'}
          >
            <window.Icon.Toggle size={13} /> Waterfall
          </button>
          <button className="ls-tool-button muted" onClick={toggleAllSegments}>
            {segments.length > 0 && openSegments.size === segments.length ? 'Collapse' : 'Expand'}
          </button>
          <button className="ls-tool-button muted" onClick={() => {
            runListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            setDetailWidth(430);
            window.localStorage?.removeItem('tracebook.trace.detailWidth');
          }}>
            Reset
          </button>
        </div>
      </div>

      <div
        ref={shellRef}
        className={`combined-trace-shell span-waterfall-mode ${waterfallCollapsed ? 'waterfall-collapsed' : ''}`}
        style={{ '--trace-detail-width': `${detailWidth}px` }}
      >
        <div className="combined-trace-scroll" ref={runListRef} onScroll={updateActiveSegmentFromScroll}>
          <TracePerformanceStrip session={session} />

          <div className="combined-trace-list">
            {segments.length ? segments.map(segment => (
              <PromptSegmentBlock
                key={segment.id}
                segment={segment}
                open={openSegments.has(segment.id)}
                onToggle={() => toggleSegment(segment.id)}
                markerRef={el => { if (el) markerRefs.current[segment.id] = el; }}
                selectedCommandId={selectedCommandId}
                onSelectCommand={selectCommand}
                collapsedTraceRows={collapsedTraceRows}
                onToggleTraceRow={toggleTraceRow}
                metricScale={metricScale}
              />
            )) : (
              <div className="ls-empty-trace">no transcript messages found</div>
            )}
            {session.live && (
              <div className="chip chip-amber"><StatusDot kind="amber" pulse size={5} /> in flight</div>
            )}
          </div>
        </div>

        <div className="combined-trace-splitter" onPointerDown={startDetailResize} title="drag to resize trace details" />
        <TraceSpanDetailPanel selection={selectedEntry} onClose={() => setSelectedCommandId(null)} />
        <TraceDurationRail segments={segments} totalMs={totalMs} activeId={activeSegment?.id} onJump={jumpToSegment} />
      </div>
    </div>
  );
}

function LangSmithInspector({ nodeId, trace, nodeDetail, session }) {
  const nodes = trace.nodes || [];
  const node = nodes.find(n => n.id === nodeId) || nodes[0];
  const [activeSection, setActiveSection] = useStateSD('input');
  const inputRef = React.useRef(null);
  const outputRef = React.useRef(null);
  const metaRef = React.useRef(null);
  if (!node) {
    return <div className="ls-inspector"><div className="ls-empty-trace">select a trace node</div></div>;
  }
  const meta = NODE_META[node.type] || NODE_META.tool;
  const payload = tracePayloadFor(node, nodeDetail, trace);
  const isLlmNode = node.type === 'llm';
  const isShellInputNode = node.name === 'shell input' || payload.attributes?.tool?.rawName === 'write_stdin';
  const followBlocks = isLlmNode ? followingTraceBlocks(node, trace) : [];
  const sections = [
    ['input', inputRef],
    ...(!isShellInputNode ? [['output', outputRef]] : []),
    ['meta', metaRef],
  ];
  const jumpTo = (key, ref) => {
    setActiveSection(key);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="ls-inspector">
      <div className="ls-inspector-tabs">
        <div className="ls-inspector-tab-set">
          {sections.map(([item, ref]) => (
            <button key={item} className={activeSection === item ? 'active' : ''} onClick={() => jumpTo(item, ref)}>
              {item}
            </button>
          ))}
        </div>
        <div className="ls-inspector-actions compact">
          <span className="ls-id-pill">ID <window.Icon.Hash size={11} /></span>
          <button className="ls-icon-button"><window.Icon.Plus size={15} /></button>
          <button className="ls-icon-button" onClick={() => window.copyText(JSON.stringify(payload, null, 2))}><window.Icon.Copy size={15} /></button>
          <button className="ls-icon-button"><window.Icon.Maximize size={15} /></button>
        </div>
      </div>

      <div className="ls-inspector-scroll">
        <div ref={inputRef} className="ls-scroll-anchor">
          <InspectorSection title="Input" mode={payload.attributes?.tool?.category || 'context'}>
            <PrimaryPayload value={payload.input} node={{ ...node, detail: { attributes: payload.attributes } }} mode="input" />
            {!isShellInputNode && <DialogueBeforeCall entries={payload.input?.dialogue_before_call} />}
            <RawDetails value={payload.input} />
          </InspectorSection>
        </div>

        {!isShellInputNode && (
          <div ref={outputRef} className="ls-scroll-anchor">
            <InspectorSection title={isLlmNode ? 'Thoughts and Commands' : 'Output'} mode={isLlmNode ? `${followBlocks.length} blocks` : (payload.output?.preview ? 'text' : 'json')}>
              {isLlmNode ? (
                <LlmOutputBlocks node={node} trace={trace} nodeDetail={nodeDetail} payload={payload} />
              ) : (
                <PrimaryPayload value={payload.output} node={{ ...node, detail: { attributes: payload.attributes } }} mode="output" />
              )}
              <RawDetails value={payload.output} />
            </InspectorSection>
          </div>
        )}

        <div ref={metaRef} className="ls-scroll-anchor">
          <InspectorSection title="Meta" mode="JSON">
            <JsonPanel value={{ session: session.short, selected_type: meta.label, ...payload.attributes }} compact />
          </InspectorSection>
        </div>
      </div>
    </div>
  );
}

// ─── Inspector ───────────────────────────────────────────────────────────────

function Inspector({ nodeId, trace, nodeDetail }) {
  const node = (trace.nodes || []).find(n => n.id === nodeId);
  const [tab, setTab] = useStateSD('input');
  if (!node) {
    return (
      <div className="surface-1 flex items-center justify-center h-full">
        <div className="text-center text-[12px]" style={{ color: 'var(--ink-4)' }}>
          <div className="font-mono text-[28px] mb-2">...</div>
          select a trace node
        </div>
      </div>
    );
  }
  const detail = nodeDetail[nodeId];
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
            {node.cacheRead > 0 && <span>{node.cacheRead.toLocaleString()} cache</span>}
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
          <button className="btn btn-ghost" onClick={() => window.copyText(JSON.stringify(detail || node, null, 2))}><window.Icon.Copy size={11} /></button>
          <button className="btn btn-ghost"><window.Icon.Maximize size={11} /></button>
        </div>
      </div>

      <div className="trace-inspector-body flex-1 p-4 font-mono text-[12px] leading-[1.7]" style={{ background: 'var(--bg-0)' }}>
        {detail ? (
          tab === 'raw'
            ? <pre className="whitespace-pre-wrap text-zinc-300">{JSON.stringify({ input: detail.input, output: detail.output, attributes: detail.attributes }, null, 2)}</pre>
            : <pre className="whitespace-pre-wrap break-words">{jsonHighlight(detail[tab] || {})}</pre>
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

function RunMeta({ session, trace }) {
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
          <div
            className="font-mono text-[11px]"
            title={session.cwd}
            style={{ color: 'var(--ink-1)', wordBreak: 'break-all', lineHeight: 1.45 }}
          >
            {abbreviateCwd(session.cwd)}
          </div>
          <div className="t-meta mt-0.5" style={{ fontSize: '10.5px' }}>{session.branch}</div>
        </div>
        <div className="border-t pt-3" style={{ borderColor: 'var(--line-0)' }}>
          <div className="t-eyebrow mb-1.5">model</div>
          <div className="font-mono text-[12px]" style={{ color: 'var(--ink-1)' }}>{session.model}</div>
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
        <ul className="space-y-1.5 text-[12px] font-mono trace-side-scroll">
          {(() => {
            // Count tool calls from trace nodes
            const nodes = (trace && trace.nodes) || [];
            const counts = {};
            for (const n of nodes) {
              if (['tool', 'mcp', 'skill'].includes(n.type)) {
                counts[n.name] = (counts[n.name] || 0) + 1;
              }
            }
            const entries = Object.entries(counts).sort((a,b) => b[1]-a[1]);
            if (entries.length === 0) return (
              <li className="text-zinc-500 text-[11px]">no tool calls recorded</li>
            );
            return entries.map(([name, count]) => (
              <li key={name} className="flex justify-between">
                <span className="text-zinc-200">{name}</span>
                <span className="num" style={{ color: 'var(--ink-3)' }}>{count}</span>
              </li>
            ));
          })()}
        </ul>
      </div>
    </div>
  );
}

function TraceSummary({ session }) {
  const summary = session.traceSummary || {};
  const cacheRead = summary.cacheRead || session.cacheRead || 0;
  const tokens = summary.tokens || session.tokens || 0;
  const readRatio = cacheRead > 0 ? cacheRead / Math.max(cacheRead + session.tokensIn + session.cacheWrite, 1) : 0;
  const stats = [
    ['llm calls', summary.llmCalls || 0],
    ['tool calls', summary.toolCalls || 0],
    ['fresh tokens', window.formatNum(tokens)],
    ['cache read', window.formatNum(cacheRead)],
    ['cache hit', `${(readRatio * 100).toFixed(1)}%`],
    ['cost', `$${(summary.cost || session.cost || 0).toFixed(2)}`],
  ];
  return (
    <div className="grid grid-cols-6 gap-2 mb-5">
      {stats.map(([label, value]) => (
        <div key={label} className="surface-2 px-3 py-2">
          <div className="t-eyebrow mb-1">{label}</div>
          <div className="font-mono num text-[13px]" style={{ color: label === 'cost' ? '#6ee7b7' : 'var(--ink-1)' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function traceTimingForDetail(detail = {}, trace = {}) {
  const turns = compactTranscript(detail.transcript || []).filter(visibleTranscriptTurn);
  const originMs = detail.trace?.originAt
    ? new Date(detail.trace.originAt).getTime()
    : (detail.startedAt ? new Date(detail.startedAt).getTime() : NaN);
  const fallbackTotal = (() => {
    const times = turns.map(t => t.ts ? new Date(t.ts).getTime() : NaN).filter(Number.isFinite);
    if (!times.length || !Number.isFinite(originMs)) return 1000;
    return Math.max(1000, Math.max(...times) - originMs + 1000);
  })();
  const totalMs = Math.max(trace?.totalDuration || 0, fallbackTotal, 1000);
  return { turns, originMs, totalMs };
}

function transcriptRowsForDetail(detail = {}, trace = {}) {
  const nodes = trace?.nodes || [];
  const { turns, originMs, totalMs } = traceTimingForDetail(detail, trace);
  const transcriptRows = turns.map((turn, index) => turnTimelineRow(turn, index, originMs, totalMs, nodes));
  return [...transcriptRows, ...traceRowsForUnmatchedNodes(nodes, transcriptRows)]
    .sort((a, b) => (Number(a.start || 0) - Number(b.start || 0)) || (rowSortPriority(a) - rowSortPriority(b)));
}

function userInputSegmentsForDetail(detail = {}, trace = {}) {
  const rows = transcriptRowsForDetail(detail, trace);
  const { totalMs } = traceTimingForDetail(detail, trace);
  return buildPromptSegments(rows, trace?.nodes || [], totalMs);
}

function transcriptCategoryForRow(row) {
  if (row.synthetic === 'action-group') return actionGroupCategory(row.actionNodes || []);
  if (row.node?.type === 'llm') return 'model';
  if (row.turn?.kind === 'tool') return row.turn.category || contextToolCategory(row.turn.rawName || row.turn.name);
  if (row.turn?.kind === 'compression') return 'system';
  if (row.turn?.role === 'user') return 'user';
  if (row.turn?.role === 'assistant') return 'model';
  return 'tool';
}

function transcriptKindForRow(row) {
  const turn = row.turn || {};
  if (turn.kind === 'compression') return 'system';
  if (turn.kind !== 'tool' && turn.role === 'user') return 'user';
  if (turn.kind !== 'tool' && turn.role === 'assistant') return 'assistant';
  if (row.node?.type === 'llm') return 'thought';

  const category = transcriptCategoryForRow(row);
  const raw = String(category || '').toLowerCase();
  const rawName = String(turn.rawName || turn.name || '').toLowerCase();
  if (raw === 'shell' || raw === 'shell_command' || raw === 'exec_command' || rawName.includes('exec_command')) return 'shell';
  if (raw.includes('web') || raw.includes('browser') || raw === 'search' || rawName.includes('search_query')) return 'ask query';
  if (raw === 'edit_file' || raw === 'patch' || raw === 'write_file') return 'patch';
  if (raw.includes('agent')) return 'agent';
  if (raw.includes('read') || raw.includes('file')) return 'file';
  if (raw === 'model') return 'thought';
  return actionBucketLabel(category || rowTitle(row), 1);
}

function transcriptOperationClass(row) {
  const turn = row.turn || {};
  if (turn.kind === 'compression') return 'op-system';
  if (turn.kind !== 'tool' && turn.role === 'user') return 'op-user';
  if (turn.kind !== 'tool' && turn.role === 'assistant') return 'op-model';
  return operationClassForCategory(transcriptCategoryForRow(row));
}

function transcriptIconForKind(kind) {
  if (kind === 'shell') return window.Icon.Terminal;
  if (kind === 'user') return window.Icon.Sessions;
  if (kind === 'assistant' || kind === 'thought') return window.Icon.Brain;
  if (kind === 'ask query') return window.Icon.Globe;
  if (kind === 'patch') return window.Icon.Edit;
  if (kind === 'file') return window.Icon.File;
  if (kind === 'agent') return window.Icon.Layers;
  return window.Icon.Tool || window.Icon.File;
}

function transcriptTitleForRow(row) {
  const turn = row.turn || {};
  if (row.node?.type === 'llm') return row.node.name || 'model call';
  if (row.synthetic === 'action-group') return row.turn?.name || 'model action';
  return rowTitle(row);
}

function transcriptOutputTextForTurn(turn) {
  if (!turn) return '';
  if (turn.outputPreview) return String(turn.outputPreview);
  if (typeof turn.output === 'string') return turn.output;
  if (hasValue(turn.output)) return detailPayloadText(turn.output);
  return '';
}

function transcriptToolInputText(row) {
  const turn = row.turn || {};
  const input = turn.input || {};
  const command = primaryCommand(input);
  const file = input.file_path || input.path || input.source_file || input.document_url || input.spreadsheet_url || input.presentation_url;
  if (command) return command;
  if (file && turn.text) return `${file}\n\n${turn.text}`;
  if (file) return file;
  if (turn.text) return turn.text;
  if (Object.keys(input).length) return detailPayloadText(input);
  return row.node?.preview || '';
}

function transcriptRowBodyText(row) {
  const turn = row.turn || {};
  if (turn.kind === 'compression') return turn.text || 'conversation compressed';
  if (turn.kind !== 'tool') return turn.text || '';
  if (row.node?.type === 'llm') return thoughtTextFor(row.node.detail || {}, row.node);
  if (row.synthetic === 'action-group') return actionGroupSummary(row);
  return [transcriptToolInputText(row), transcriptOutputTextForTurn(turn)].filter(Boolean).join('\n\n');
}

function TranscriptTextBlock({ text, label = 'message' }) {
  const value = String(text || '');
  const lines = value.split('\n');
  const isLarge = value.length > 1000 || lines.length > 12;
  if (!isLarge) return <div className="raw-transcript-text">{value}</div>;
  const preview = lines.slice(0, 8).join('\n');
  return (
    <div className="raw-transcript-text-wrap">
      <div className="raw-transcript-text">{preview}</div>
      <details className="raw-transcript-full">
        <summary>show full {label} · {lines.length} lines · {value.length.toLocaleString()} chars</summary>
        <div className="raw-transcript-text">{value}</div>
      </details>
    </div>
  );
}

function TranscriptToolBody({ row }) {
  const turn = row.turn || {};
  const inputText = transcriptToolInputText(row);
  const outputText = transcriptOutputTextForTurn(turn);
  const kind = transcriptKindForRow(row);
  const isShell = kind === 'shell';
  const isPatch = kind === 'patch' || looksLikeDiff(inputText || outputText);
  const [statusTone] = rowStatus(row);
  const outputOpen = statusTone === 'error' || (outputText && outputText.length < 900);
  const outputLines = outputText ? outputText.split('\n').length : 0;

  if (row.node?.type === 'llm') {
    const output = row.node?.detail?.output || {};
    const thought = thoughtTextFor(row.node.detail || {}, row.node);
    const calls = generatedToolCallsForOutput(output);
    return (
      <div className="raw-transcript-body-stack">
        {thought ? <TranscriptTextBlock text={thought} label="thought" /> : <div className="trace-empty-detail">no thought recorded</div>}
        <GeneratedToolCallsBlock calls={calls} />
      </div>
    );
  }

  if (row.synthetic === 'action-group') {
    return (
      <div className="raw-transcript-body-stack">
        <TranscriptTextBlock text={actionGroupSummary(row)} label="action" />
        <ActionGroupOutput row={row} />
      </div>
    );
  }

  return (
    <div className="raw-transcript-body-stack">
      {inputText ? (
        isShell && !isPatch ? (
          <div className="shell-command-frame">
            <CodeSnippet text={inputText} shell maxChars={4200} maxLines={34} />
          </div>
        ) : (
          <CodeSnippet text={inputText} forceDiff={isPatch} maxChars={4200} maxLines={34} />
        )
      ) : (
        <div className="trace-empty-detail">no input recorded</div>
      )}
      {outputText && (
        <details className="raw-transcript-output" open={outputOpen}>
          <summary>output · {outputLines} lines</summary>
          <CodeSnippet text={outputText} forceDiff={isPatch} maxChars={4200} maxLines={34} />
        </details>
      )}
    </div>
  );
}

function TranscriptTimelineRow({ row, index, markerRef }) {
  const kind = transcriptKindForRow(row);
  const Icon = transcriptIconForKind(kind);
  const opClass = transcriptOperationClass(row);
  const [statusTone, statusText] = rowStatus(row);
  const tokens = rowMetricTokens(row);
  const cost = rowMetricCost(row);
  const hasMetrics = tokens > 0 || cost > 0;
  const title = transcriptTitleForRow(row);
  const bodyText = transcriptRowBodyText(row);

  return (
    <article ref={markerRef} className={`raw-transcript-row ${opClass}`}>
      <div className="raw-transcript-row-head">
        <span className="raw-transcript-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="raw-transcript-time">+{traceSeconds(row.start)}</span>
        <span className="raw-transcript-kind">
          <Icon size={13} /> {kind}
        </span>
        <strong title={title}>{title}</strong>
        <span className="raw-transcript-meta">
          <span className={`trace-span-status ${statusTone}`}>{statusText}</span>
          <span>{traceSeconds(row.duration)}</span>
          {hasMetrics && <span>{window.formatNum(tokens)} tok</span>}
          {cost > 0 && <span><CostValue value={cost} /></span>}
        </span>
      </div>
      <div className="raw-transcript-row-body">
        {row.turn?.kind === 'tool' || row.node?.type === 'llm' || row.synthetic === 'action-group' ? (
          <TranscriptToolBody row={row} />
        ) : (
          <TranscriptTextBlock text={bodyText || 'empty message'} label={kind} />
        )}
      </div>
    </article>
  );
}

function TranscriptPanel({ session, trace }) {
  const detail = sessionDetailForView(session);
  const transcriptTrace = sessionTraceForView(session, trace);
  const listRef = React.useRef(null);
  const markerRefs = React.useRef({});
  const [copied, setCopied] = useStateSD(false);
  const rows = transcriptRowsForDetail(detail, transcriptTrace);
  const segments = buildPromptSegments(rows, transcriptTrace.nodes || [], traceTimingForDetail(detail, transcriptTrace).totalMs);
  const [activeSegmentId, setActiveSegmentId] = useStateSD(segments[0]?.id || null);
  const segmentByRowId = new Map(
    segments
      .map(segment => [segment.userRow?.id, segment.id])
      .filter(([rowId]) => rowId)
  );
  const stats = rows.reduce((acc, row) => {
    const kind = transcriptKindForRow(row);
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});
  const tools = rows.filter(row => row.turn?.kind === 'tool').length;
  const thoughts = rows.filter(row => row.node?.type === 'llm').length;

  React.useEffect(() => {
    setActiveSegmentId(segments[0]?.id || null);
  }, [session?.id, segments.length]);

  const updateActiveSegmentFromScroll = () => {
    const list = listRef.current;
    if (!list || !segments.length) return;
    const top = list.getBoundingClientRect().top + 8;
    let current = segments[0];
    for (const segment of segments) {
      const marker = markerRefs.current[segment.id];
      if (marker && marker.getBoundingClientRect().top <= top) current = segment;
    }
    setActiveSegmentId(current.id);
  };

  const jumpToSegment = (id, behavior = 'auto') => {
    setActiveSegmentId(id);
    requestAnimationFrame(() => {
      const marker = markerRefs.current[id];
      const list = listRef.current;
      if (!marker || !list) return;
      const markerRect = marker.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const nextTop = Math.max(0, list.scrollTop + markerRect.top - listRect.top - 8);
      list.scrollTo({ top: nextTop, behavior });
    });
  };

  React.useEffect(() => {
    const raw = window.sessionStorage?.getItem('tracebook.transcriptJump');
    if (!raw || !segments.length) return;
    try {
      const pending = JSON.parse(raw);
      if (pending?.sessionId && pending.sessionId !== session?.id && pending.sessionId !== session?.short) return;
      if (!segments.some(segment => segment.id === pending?.segmentId)) return;
      window.sessionStorage?.removeItem('tracebook.transcriptJump');
      jumpToSegment(pending.segmentId, 'auto');
    } catch (_) {
      window.sessionStorage?.removeItem('tracebook.transcriptJump');
    }
  }, [session?.id, segments.length, rows.length]);

  const copyTranscript = async () => {
    const text = rows.map((row, index) => {
      const kind = transcriptKindForRow(row);
      const title = transcriptTitleForRow(row);
      const [statusTone, statusText] = rowStatus(row);
      const status = statusTone === 'done' ? statusText : `${statusTone}:${statusText}`;
      return [
        `#${index + 1} +${traceSeconds(row.start)} ${kind} · ${status} · ${title}`,
        transcriptRowBodyText(row),
      ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');
    const ok = await window.copyText(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <SessionReadableShell kind="transcript" segments={segments} activeId={activeSegmentId} onJump={jumpToSegment}>
      <section className="raw-transcript-panel">
        <header className="raw-transcript-top">
          <div>
            <h2>Transcript</h2>
            <p>{rows.length} blocks · {tools} tool calls · {thoughts} model calls</p>
          </div>
          <div className="raw-transcript-counts">
            {['user', 'assistant', 'thought', 'shell', 'ask query'].map(kind => (
              stats[kind] ? <span key={kind}>{kind} <em>{stats[kind]}</em></span> : null
            ))}
          </div>
          <button className="ls-tool-button" onClick={copyTranscript}>
            <window.Icon.Copy size={13} /> {copied ? 'copied' : 'copy raw'}
          </button>
        </header>
        <div className="raw-transcript-list" ref={listRef} onScroll={updateActiveSegmentFromScroll}>
          {rows.length ? rows.map((row, index) => {
            const segmentId = segmentByRowId.get(row.id);
            return (
              <TranscriptTimelineRow
                key={`${row.id}-${index}`}
                row={row}
                index={index}
                markerRef={segmentId ? el => { if (el) markerRefs.current[segmentId] = el; } : undefined}
              />
            );
          }) : (
            <div className="ls-empty-trace">no transcript events found</div>
          )}
        </div>
      </section>
    </SessionReadableShell>
  );
}

// ─── SessionDetailScreen ─────────────────────────────────────────────────────

function SessionDetailNav({ session, view }) {
  const base = `#/sessions/${session.id}`;
  return (
    <nav className="session-detail-nav" aria-label="session detail views">
      <a className={view === 'trace' ? 'active' : ''} href={base}>trace</a>
      <a className={view === 'context' ? 'active' : ''} href={`${base}/context`}>context</a>
      <a className={view === 'transcript' ? 'active' : ''} href={`${base}/transcript`}>transcript</a>
    </nav>
  );
}

function SessionDetailScreen({ id, view = 'trace' }) {
  // Re-render counter — incremented whenever tracebook:session-ready fires for this id
  const [rev, setRev] = useStateSD(0);
  const [loading, setLoading] = useStateSD(false);
  const [loadError, setLoadError] = useStateSD(null);
  React.useEffect(() => {
    function onSessionReady(e) {
      const detail = e.detail || {};
      if (!detail.id || detail.id === id || (window._SESSION_DETAIL && (window._SESSION_DETAIL.id === id || window._SESSION_DETAIL.short === id))) {
        setLoading(false);
        setLoadError(null);
        setRev(r => r + 1);
      }
    }
    function onSessionLoading(e) {
      if ((e.detail || {}).id === id) {
        setLoading(true);
        setLoadError(null);
        setRev(r => r + 1);
      }
    }
    function onSessionError(e) {
      if ((e.detail || {}).id === id) {
        setLoading(false);
        setLoadError(window._SESSION_ERROR || 'session failed to load');
        setRev(r => r + 1);
      }
    }
    window.addEventListener('tracebook:session-loading', onSessionLoading);
    window.addEventListener('tracebook:session-ready', onSessionReady);
    window.addEventListener('tracebook:session-error', onSessionError);
    return () => {
      window.removeEventListener('tracebook:session-loading', onSessionLoading);
      window.removeEventListener('tracebook:session-ready', onSessionReady);
      window.removeEventListener('tracebook:session-error', onSessionError);
    };
  }, [id]);

  // Prefer the detail object fetched on demand (has trace, transcript, etc.)
  const detailObj = window._SESSION_DETAIL && (window._SESSION_DETAIL.id === id || window._SESSION_DETAIL.short === id)
    ? window._SESSION_DETAIL : null;
  const session = detailObj || (window.SESSIONS || []).find(s => s.id === id || s.short === id);
  React.useEffect(() => {
    const hasDetail = window._SESSION_DETAIL && (window._SESSION_DETAIL.id === id || window._SESSION_DETAIL.short === id);
    if (!hasDetail && window.loadSessionDetail) {
      setLoading(true);
      setLoadError(null);
      window.loadSessionDetail(id)
        .then(detail => {
          if (!detail && window._SESSION_ERROR) setLoadError(window._SESSION_ERROR);
        })
        .catch(e => setLoadError(String(e && e.message ? e.message : e)))
        .finally(() => setLoading(false));
    }
  }, [id]);
  const trace = detailObj?.trace || session?.trace || { totalDuration: 0, totalTokens: 0, totalCost: 0, nodes: [] };
  const [copied, setCopied] = useStateSD(false);
  const [copiedDialogue, setCopiedDialogue] = useStateSD(false);

  if (!session && loading) return <EmptyState glyph="..." title="loading session" body={`reading ${id} from disk.`} />;
  if (!session) return <EmptyState glyph="∅" title="session not found" body={loadError || `no session matches "${id}".`} path={`transcripts/${id}.jsonl`} />;

  const copyResume = async () => {
    const ok = await window.copyText(session.resumeCommand || session.id);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };
  const copyDialogue = async () => {
    const turns = compactTranscript((window._SESSION_DETAIL && window._SESSION_DETAIL.transcript) || []);
    const text = turns.map(transcriptText).filter(Boolean).join('\n\n');
    const ok = await window.copyText(text);
    if (ok) {
      setCopiedDialogue(true);
      window.setTimeout(() => setCopiedDialogue(false), 1200);
    }
  };

  return (
    <div className="fade-up ls-trace-page">
      <PageHeader
        eyebrow={`sessions / ${session.short}`}
        title={singleLineText(session.preview)}
        subtitle={(
          <span className="font-mono session-detail-subtitle">
            <span>{session.id}</span>
            {session.cwd && <span className="session-detail-folder" title={session.cwd}> · {abbreviateCwd(session.cwd)}</span>}
          </span>
        )}
        right={<>
          {session.live && (
            <span className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[11.5px] font-mono"
                  style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)', color: '#6ee7b7' }}>
              <StatusDot kind="emerald" pulse size={5} /> live · /events?session={session.short}
            </span>
          )}
          <button className="btn btn-ghost" onClick={copyResume} title={`copy ${session.resumeCommand || session.id}`}>
            <window.Icon.Copy size={13} /> {copied ? 'copied' : ''}
          </button>
          <button className="btn btn-neutral"><window.Icon.External size={13} /> open jsonl</button>
        </>}
      />

      <SessionDetailNav session={session} view={view} />

      {view === 'context' ? (
        <ContextPanel session={session} />
      ) : view === 'transcript' ? (
        <TranscriptPanel session={session} trace={trace} />
      ) : (
        <CombinedTraceView
          session={session}
          trace={trace}
          onCopyDialogue={copyDialogue}
          copiedDialogue={copiedDialogue}
        />
      )}
    </div>
  );
}
window.SessionDetailScreen = SessionDetailScreen;
