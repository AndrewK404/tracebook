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

function ContextDonut({ used, max, categories }) {
  const r = 64, c = 2 * Math.PI * r;
  // Effective max: never let the donut exceed 100% — if used > max the user
  // must be on a 1M tier we didn't detect, so widen the denominator.
  const effMax = Math.max(max, used, 1);
  const usedPct = Math.min(1, used / effMax);
  let acc = 0;
  const segs = categories.map((cat) => {
    const start = acc;
    const portion = Math.min(1 - acc, Math.max(0, cat.tokens / effMax));
    acc += portion;
    return { ...cat, start, portion };
  });
  const fmtMax = max >= 1e6 ? `${(max/1e6).toFixed(1)}M` : `${(max/1000).toFixed(0)}k`;
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
      <text x="85" y="113" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--ink-4)">{window.formatNum(used)} / {fmtMax}</text>
    </svg>
  );
}

function ContextPanel({ session }) {
  const ctx = window.CONTEXT_BUDGET;
  const compressions = window.CONTEXT_ITEMS.compressions ?? session?.compressions ?? 0;
  const free = ctx.contextMax - ctx.contextUsed;
  // Only show a "free" slice when there genuinely is free capacity left
  const cats = free > 0
    ? [...ctx.categories, { key: 'free', label: 'free', tokens: free, color: '#27272a', glyph: 'database' }]
    : ctx.categories;

  return (
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-4">
        <Eyebrow num={1} label="context budget" meta={ctx.model} />
        <Card padding="p-5">
          <div className="flex items-center justify-center mb-4">
            <ContextDonut used={ctx.contextUsed} max={ctx.contextMax} categories={ctx.categories} />
          </div>
          <div className="space-y-1.5 text-[11.5px] font-mono">
            {cats.map(cat => {
              const denom = Math.max(ctx.contextMax, ctx.contextUsed, 1);
              const pct = Math.max(0, (cat.tokens / denom) * 100);
              return (
                <div key={cat.key} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: cat.color }} />
                  <span className="flex-1" style={{ color: 'var(--ink-2)' }}>{cat.label}</span>
                  <span className="num" style={{ color: 'var(--ink-1)' }}>{window.formatNum(cat.tokens)}</span>
                  <span className="num w-12 text-right" style={{ color: 'var(--ink-4)' }}>{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
          <div className="context-compact-count in-budget">
            <window.Icon.Layers size={13} />
            <span>dialogue compacting operations</span>
            <strong>{compressions}</strong>
          </div>
        </Card>
      </div>

      <div className="col-span-8 space-y-5">
        <div>
          <Eyebrow num={2} label="what's in context" meta={`${compressions} dialogue compressions`} />
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
  items = items || [];
  const isLong = title === 'skills' || title === 'custom agents' || items.length > 8;
  return (
    <div className={`surface-2 p-3 context-group ${isLong ? 'scrollable' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <IconC size={13} className={`text-${tone === 'violet' ? 'violet' : tone === 'rose' ? 'rose' : tone === 'cyan' ? 'cyan' : 'amber'}-300`} />
        <span className="t-eyebrow">{title}</span>
        <span className="ml-auto t-meta" style={{ fontSize: '10.5px' }}>{items.length}</span>
      </div>
      <ul className="context-group-list space-y-1.5">
        {items.length ? items.map(it => (
          <li key={it.name || it.path} className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-mono text-zinc-200 truncate" title={it.path || it.name}>{it.name || it.path}</span>
            <span className="font-mono num text-[10.5px]" style={{ color: 'var(--ink-4)' }}>
              {it.source === 'context' && (!it.calls || it.calls <= 1) ? 'available' : it.calls ? `${it.calls}×` : it.tokens ? `${(((it.tokens || 0)/1000)).toFixed(1)}k` : 'seen'}
            </span>
          </li>
        )) : (
          <li className="font-mono text-[11px]" style={{ color: 'var(--ink-4)' }}>not recorded</li>
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
  if (seconds >= 100) return `${seconds.toFixed(0)}s`;
  if (seconds >= 10) return `${seconds.toFixed(1)}s`;
  return `${seconds.toFixed(2)}s`;
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
  const blocks = followingTraceBlocks(node, trace);
  if (!thoughts && !blocks.length) {
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
  const renderLines = (shownLines) => (
    <pre className={`code-snippet ${shell ? 'shell' : ''} ${isDiff ? 'diff' : ''}`}>
      {shownLines.map((line, i) => (
        <span key={i} className={isDiff ? codeLineClass(line) : ''}>
          {line || ' '}
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
    return (
      <div className={`transcript-tool ${turn.category || 'tool'}`}>
        <div className="transcript-tool-head">
          <span className="chip chip-violet">{title}</span>
          {turn.status && <span className="t-meta">{turn.status}</span>}
          {turn.ts && <time className="t-meta">{new Date(turn.ts).toLocaleString()}</time>}
        </div>
        {command ? (
          <div className="transcript-command">
            <span>$</span>
            <CodeSnippet text={command} shell={!isPatch} forceDiff={isPatch} />
          </div>
        ) : file ? (
          <div className="transcript-command file">
            <span>file</span>
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

function turnTimelineRow(turn, index, originMs, totalMs, traceNodes) {
  const tsMs = turn.ts ? new Date(turn.ts).getTime() : NaN;
  const start = Number.isFinite(originMs) && Number.isFinite(tsMs)
    ? Math.max(0, tsMs - originMs)
    : Math.min(totalMs, index * 500);
  const command = turn.kind === 'tool' ? primaryCommand(turn.input || {}) : '';
  const matched = (traceNodes || []).find(n => {
    if (n.type === 'assistant') return false;
    const delta = Math.abs((n.start || 0) - start);
    if (delta > 2500) return false;
    if (turn.kind === 'tool') {
      const nodeCommand = primaryCommand(n.detail?.input || {});
      return (command && nodeCommand === command) || n.name === turn.name;
    }
    if (turn.role === 'assistant') return n.type === 'llm';
    return false;
  });
  const duration = matched?.duration || parseWallTimeMs(turn.outputPreview || turn.output) || (turn.kind === 'tool' ? 260 : 900);
  return {
    id: `${turn.kind || turn.role}-${index}`,
    turn,
    start,
    duration,
    label: start == null ? '' : traceSeconds(start),
    node: matched,
  };
}

function traceSummaryValue(value, fallback = '—') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

function TracePerformanceStrip({ session }) {
  const s = session.traceSummary || {};
  const costPerMin = s.costPerMinute != null ? `$${Number(s.costPerMinute).toFixed(2)}/m` : '—';
  const cacheHit = s.cacheHitRatio != null ? `${(Number(s.cacheHitRatio) * 100).toFixed(1)}%` : '—';
  const failed = Number(s.failedTools || 0);
  const metrics = [
    ['wall', s.wallTimeMs ? traceSeconds(s.wallTimeMs) : session.duration],
    ['model', `${traceSummaryValue(s.llmCalls, 0)} calls`],
    ['tools', `${traceSummaryValue(s.toolCalls, 0)} calls`],
    ['failed', failed],
    ['cache', cacheHit],
    ['burn', costPerMin],
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

function CombinedTraceView({ session, trace, onCopyDialogue, copiedDialogue }) {
  const [showTimeline, setShowTimeline] = useStateSD(() => window.localStorage?.getItem('tracebook.trace.showTimeline') === '1');
  const [activeUserId, setActiveUserId] = useStateSD(null);
  const runListRef = React.useRef(null);
  const markerRefs = React.useRef({});
  const [showStickyUser, setShowStickyUser] = useStateSD(false);
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
  const rows = turns.map((turn, index) => turnTimelineRow(turn, index, originMs, totalMs, nodes));
  const userRows = rows.filter(row => row.turn.role === 'user' && row.turn.kind !== 'tool');
  const activeUser = userRows.find(row => row.id === activeUserId) || userRows[0];
  const markers = totalMs > 10 * 60 * 1000 ? [0, .5, 1] : [0, .25, .5, .75, 1];

  React.useEffect(() => {
    if (!activeUserId && userRows[0]) setActiveUserId(userRows[0].id);
  }, [rows.length]);

  const updateActiveUserFromScroll = () => {
    const list = runListRef.current;
    if (!list || !userRows.length) return;
    setShowStickyUser(list.scrollTop > 12);
    const top = list.getBoundingClientRect().top + 8;
    let current = userRows[0];
    for (const row of userRows) {
      const marker = markerRefs.current[row.id];
      if (marker && marker.getBoundingClientRect().top <= top) current = row;
    }
    setActiveUserId(current.id);
  };

  const scrollToActiveUser = () => {
    if (!activeUser) return;
    markerRefs.current[activeUser.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleTimeline = () => {
    setShowTimeline(v => {
      const next = !v;
      window.localStorage?.setItem('tracebook.trace.showTimeline', next ? '1' : '0');
      return next;
    });
  };

  return (
    <div className={`combined-trace-shell ${showTimeline ? 'show-timeline' : ''}`}>
      <div className="ls-trace-left-head combined-trace-head">
        <div className="ls-trace-title">Trace</div>
        <div className="ls-trace-tools">
          <button className={`ls-tool-button ${showTimeline ? 'active' : ''}`} onClick={toggleTimeline}>
            {showTimeline ? 'Hide timeline' : 'Show timeline'}
          </button>
          <button className="ls-icon-button" title="copy dialogue" onClick={onCopyDialogue}>
            <window.Icon.Copy size={14} />
          </button>
          <button className="ls-tool-button muted" onClick={() => { runListRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            Reset
          </button>
        </div>
      </div>

      <TracePerformanceStrip session={session} />

      {activeUser && showStickyUser && (
        <button className="ls-trace-user-input" onClick={scrollToActiveUser}>
          <span><window.Icon.Sessions size={12} /> user input {userRows.length > 1 ? `${userRows.indexOf(activeUser) + 1}/${userRows.length}` : ''}</span>
          <strong>{activeUser.turn.text}</strong>
        </button>
      )}

      {showTimeline && (
        <div className="combined-time-grid">
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

      <div className="ls-run-list combined-trace-list" ref={runListRef} onScroll={updateActiveUserFromScroll}>
        {rows.length ? rows.map(row => {
          const isUser = row.turn.role === 'user' && row.turn.kind !== 'tool';
          const left = Math.max(0, Math.min(99.4, (row.start / totalMs) * 100));
          const width = Math.max(0.4, Math.min(100 - left, (row.duration / totalMs) * 100));
          const meta = row.node ? (NODE_META[row.node.type] || NODE_META.tool) : (isUser ? NODE_META.tool : NODE_META.assistant);
          return (
            <div
              key={row.id}
              ref={el => { if (isUser && el) markerRefs.current[row.id] = el; }}
              className={`combined-trace-row ${isUser ? 'user-row' : ''}`}
            >
              <div className="combined-trace-card">
                <TranscriptBlock turn={row.turn} />
                {row.node && (
                  <div className={`combined-row-metrics ${row.node.status && row.node.status !== 'completed' ? 'warn' : ''}`}>
                    <span>{traceSeconds(row.node.duration)}</span>
                    {row.node.tokens > 0 && <span>{window.formatNum(row.node.tokens)} tok</span>}
                    {row.node.cost > 0 && <span>${row.node.cost.toFixed(row.node.cost >= 1 ? 2 : 4)}</span>}
                    {row.node.cacheRead > 0 && <span>{window.formatNum(row.node.cacheRead)} cache</span>}
                    {row.node.status && row.node.status !== 'completed' && <span>{row.node.status}</span>}
                  </div>
                )}
              </div>
              {showTimeline && (
                <div className="combined-row-timeline">
                  {markers.map(p => <span key={p} className="ls-run-tick" style={{ left: `${p * 100}%` }} />)}
                  <span className="combined-row-time">{row.label}</span>
                  <span
                    className="combined-row-bar"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: meta.bar || meta.bg,
                      borderLeftColor: meta.color,
                    }}
                  />
                </div>
              )}
            </div>
          );
        }) : (
          <div className="ls-empty-trace">no transcript messages found</div>
        )}
        {session.live && (
          <div className="chip chip-amber"><StatusDot kind="amber" pulse size={5} /> in flight</div>
        )}
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

// ─── SessionDetailScreen ─────────────────────────────────────────────────────

function SessionDetailScreen({ id }) {
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
      window.loadSessionDetail(id).finally(() => setLoading(false));
    }
  }, [id]);
  const [tab, setTab] = useStateSD('trace');
  const trace = detailObj?.trace || { totalDuration: 0, totalTokens: 0, totalCost: 0, nodes: [] };
  const nodeDetail = window.NODE_DETAIL || {};
  const firstNode = (trace.nodes && trace.nodes.length > 1)
    ? trace.nodes[1].id : (trace.nodes && trace.nodes[0] ? trace.nodes[0].id : null);
  const [selected, setSelected] = useStateSD(firstNode);
  const [copied, setCopied] = useStateSD(false);
  const [copiedDialogue, setCopiedDialogue] = useStateSD(false);
  // Reset selected node when data reloads
  React.useEffect(() => { if (firstNode) setSelected(firstNode); }, [firstNode, rev]);

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

  const tabs = [
    { key: 'trace', label: 'trace' },
    { key: 'context', label: 'context window' },
  ];

  return (
    <div className={`fade-up ${tab === 'trace' ? 'ls-trace-page' : ''}`}>
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

      <div className={`border-b flex items-center gap-0 mb-6 ${tab === 'trace' ? 'ls-detail-tabs' : ''}`} style={{ borderColor: 'var(--line-0)' }}>
        {tabs.map(t => (
          <button key={t.key} className={`tabline ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'context' && <ContextPanel session={session} />}

      {tab === 'trace' && (
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
