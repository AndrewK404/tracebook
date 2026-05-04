// Mock data for leibniz

// ─── sessions ────────────────────────────────────────────────────────────────

const SESSIONS = [
  {
    id: '01HXKQ3F8M2P9NTQVZWX4D',
    short: '01HXKQ3F',
    preview: 'refactor approvals store to use last-match-wins policy resolution',
    cwd: '~/code/leibniz-platform',
    project: 'leibniz-platform',
    branch: 'feat/policy-engine',
    turns: 47,
    cost: 1.84,
    duration: '2h 14m',
    started: '2h ago',
    last: 'now',
    live: true,
    status: 'running',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    lastAction: 'edit leibniz/store.py +12 −3',
    tokensIn: 124180,
    tokensOut: 32040,
    cacheWrite: 18420,
    cacheRead: 428890,
    contextUsed: 253600,
    contextMax: 1000000,
  },
  {
    id: '01HXKP9R7C4WJ8VKNB2L8H',
    short: '01HXKP9R',
    preview: 'add SSE streaming endpoint for live transcript tailing',
    cwd: '~/code/leibniz-platform',
    project: 'leibniz-platform',
    branch: 'feat/sse',
    turns: 31,
    cost: 0.94,
    duration: '1h 02m',
    started: '3h ago',
    last: '12m ago',
    live: false,
    status: 'idle',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  },
  {
    id: '01HXKM4D2H8FN3RTQB9CK1',
    short: '01HXKM4D',
    preview: 'why is jest hanging on the watcher teardown step',
    cwd: '~/code/acme-web',
    project: 'acme-web',
    branch: 'main',
    turns: 18,
    cost: 0.42,
    duration: '34m',
    started: '4h ago',
    last: '38m ago',
    live: false,
    status: 'idle',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  },
  {
    id: '01HXKJ6W1A2BCDXY7PMNQ4',
    short: '01HXKJ6W',
    preview: 'design system audit — find unused color tokens and dead css',
    cwd: '~/code/acme-web',
    project: 'acme-web',
    branch: 'chore/ds-audit',
    turns: 22,
    cost: 0.71,
    duration: '48m',
    started: 'yesterday',
    last: 'yesterday',
    live: false,
    status: 'idle',
    provider: 'anthropic',
    model: 'claude-opus-4',
  },
  {
    id: '01HXK8B3Z5K9LM2FYW7G3R',
    short: '01HXK8B3',
    preview: 'draft mcp server skeleton for memory sector taxonomy',
    cwd: '~/code/leibniz-platform',
    project: 'leibniz-platform',
    branch: 'feat/memory',
    turns: 14,
    cost: 0.38,
    duration: '22m',
    started: 'yesterday',
    last: 'yesterday',
    live: false,
    status: 'idle',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  },
  {
    id: '01HXK2N7Y4QR8HJVKW9A2D',
    short: '01HXK2N7',
    preview: 'investigate flaky e2e test on the auth redirect flow',
    cwd: '~/code/internal-tools',
    project: 'internal-tools',
    branch: 'main',
    turns: 9,
    cost: 0.18,
    duration: '14m',
    started: '2d ago',
    last: '2d ago',
    live: false,
    status: 'idle',
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
  },
  {
    id: '01HXJ7QMP2KX9LJ8TVRH3F',
    short: '01HXJ7QM',
    preview: 'port the cli runner to use anyio task groups',
    cwd: '~/code/leibniz-platform',
    project: 'leibniz-platform',
    branch: 'refactor/anyio',
    turns: 26,
    cost: 0.62,
    duration: '52m',
    started: '3d ago',
    last: '3d ago',
    live: false,
    status: 'idle',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
  },
];

// ─── context window for the live session ─────────────────────────────────────

const CONTEXT_BUDGET = {
  model: 'claude-sonnet-4-5',
  contextMax: 1000000,
  contextUsed: 253600,
  categories: [
    { key: 'system_prompt', label: 'system prompt',     tokens: 9500,   color: '#34d399', glyph: 'database' },
    { key: 'system_tools',  label: 'system tools',      tokens: 22400,  color: '#6ee7b7', glyph: 'database' },
    { key: 'mcp_tools',     label: 'mcp tools',         tokens: 2100,   color: '#67e8f9', glyph: 'plug' },
    { key: 'agents',        label: 'custom agents',     tokens: 12800,  color: '#a78bfa', glyph: 'brain' },
    { key: 'memory',        label: 'memory files',      tokens: 2800,   color: '#fbbf24', glyph: 'file' },
    { key: 'skills',        label: 'skills',            tokens: 4900,   color: '#fb7185', glyph: 'sparkles' },
    { key: 'messages',      label: 'messages',          tokens: 198100, color: '#7dd3fc', glyph: 'hash' },
    { key: 'autocompact',   label: 'autocompact buffer',tokens: 33000,  color: '#52525b', glyph: 'database' },
  ],
};

// items composing the prompt — for the "what's in context" panel
const CONTEXT_ITEMS = {
  agents: [
    { name: 'general-purpose', tokens: 4200, path: '~/.claude/agents/general-purpose.md' },
    { name: 'statusline-setup', tokens: 1100, path: '~/.claude/agents/statusline-setup.md' },
    { name: 'output-style-setup', tokens: 1300, path: '~/.claude/agents/output-style-setup.md' },
    { name: 'leibniz-platform/code-reviewer', tokens: 6200, path: '~/code/leibniz-platform/.claude/agents/code-reviewer.md' },
  ],
  skills: [
    { name: 'leibniz-platform/sse-debugger', tokens: 2400, path: '~/code/leibniz-platform/.claude/skills/sse-debugger/SKILL.md' },
    { name: 'leibniz-platform/policy-author', tokens: 2500, path: '~/code/leibniz-platform/.claude/skills/policy-author/SKILL.md' },
  ],
  mcp: [
    { name: 'leibniz-memory', tokens: 1200, tools: 4, transport: 'stdio' },
    { name: 'github', tokens: 900, tools: 12, transport: 'stdio' },
  ],
  memory: [
    { name: 'CLAUDE.md (project)', tokens: 1900, path: '~/code/leibniz-platform/CLAUDE.md' },
    { name: 'CLAUDE.md (user)', tokens: 900, path: '~/.claude/CLAUDE.md' },
  ],
  systemTools: [
    { name: 'Bash', tokens: 4200 },
    { name: 'Edit', tokens: 3100 },
    { name: 'Read', tokens: 2200 },
    { name: 'Write', tokens: 2100 },
    { name: 'Grep', tokens: 1800 },
    { name: 'Glob', tokens: 1300 },
    { name: 'WebFetch', tokens: 2400 },
    { name: 'WebSearch', tokens: 1700 },
    { name: 'Task', tokens: 3600 },
  ],
};

// ─── trace (waterfall) for the live session ──────────────────────────────────
// node types: assistant, llm, tool, skill, mcp

const TRACE = {
  totalDuration: 14820, // ms
  totalTokens: 18420,
  totalCost: 0.062,
  startedAt: '14:32:08.412',
  rootName: 'turn 47 — refactor policy resolver',
  nodes: [
    { id: 'a1', type: 'assistant', name: 'assistant.run',                 start: 0,     duration: 14820, tokens: 18420, cost: 0.062, depth: 0, parent: null, children: ['l1','t1','s1','t2','m1','l2','t3','l3'] },
    { id: 'l1', type: 'llm',       name: 'claude-sonnet-4-5 · plan',      start: 0,     duration: 1840,  tokens: 4120,  cost: 0.014, depth: 1, parent: 'a1' },
    { id: 't1', type: 'tool',      name: 'Grep',                          start: 1840,  duration: 320,   tokens: 380,   cost: 0,     depth: 1, parent: 'a1', preview: 'pattern: "class.*Policy" path: leibniz/' },
    { id: 's1', type: 'skill',     name: 'skill: policy-author',          start: 2200,  duration: 80,    tokens: 2500,  cost: 0,     depth: 1, parent: 'a1', preview: 'loaded SKILL.md from project' },
    { id: 't2', type: 'tool',      name: 'Read',                          start: 2300,  duration: 90,    tokens: 1200,  cost: 0,     depth: 1, parent: 'a1', preview: 'leibniz/store.py' },
    { id: 'm1', type: 'mcp',       name: 'mcp:leibniz-memory.recall',     start: 2400,  duration: 210,   tokens: 480,   cost: 0,     depth: 1, parent: 'a1', preview: 'sector: project · query: "policy precedence"' },
    { id: 'l2', type: 'llm',       name: 'claude-sonnet-4-5 · synthesize',start: 2620,  duration: 4900,  tokens: 6800,  cost: 0.022, depth: 1, parent: 'a1' },
    { id: 't3', type: 'tool',      name: 'Edit',                          start: 7560,  duration: 140,   tokens: 940,   cost: 0,     depth: 1, parent: 'a1', preview: 'leibniz/store.py +12 −3' },
    { id: 'l3', type: 'llm',       name: 'claude-sonnet-4-5 · summarize', start: 7780,  duration: 7040,  tokens: 2000,  cost: 0.026, depth: 1, parent: 'a1', live: true },
  ],
};

// inspector content for selected node
const NODE_DETAIL = {
  l1: {
    input: { messages: [{ role: 'user', content: 'refactor the policy resolver to use last-match-wins ordering. keep the rule format the same.' }], system: '<system prompt + tools + memory + skills>' },
    output: { stop_reason: 'tool_use', text: "i'll start by mapping the current resolver and finding all references." },
    attributes: { model: 'claude-sonnet-4-5', temperature: 0, max_tokens: 8192, stream: true },
  },
  t1: {
    input: { tool: 'Grep', args: { pattern: 'class.*Policy', path: 'leibniz/', output_mode: 'files_with_matches' } },
    output: { matches: ['leibniz/store.py', 'leibniz/policy.py', 'leibniz/resolver.py'] },
    attributes: { tool_use_id: 'toolu_01HXKQ3F4Z', cached: false },
  },
  l2: {
    input: { messages: '<continued from l1 + tool results>', system: '<elided>' },
    output: { stop_reason: 'tool_use', text: 'i found three call sites. the resolver currently uses first-match precedence — i\'ll switch it to last-match.' },
    attributes: { model: 'claude-sonnet-4-5', temperature: 0, max_tokens: 8192, stream: true },
  },
  t3: {
    input: { tool: 'Edit', args: { file_path: 'leibniz/store.py', old_string: 'for rule in rules:\n    if match(rule, ctx):\n        return rule.action', new_string: 'matched = None\nfor rule in rules:\n    if match(rule, ctx):\n        matched = rule\nreturn matched.action if matched else default' } },
    output: { result: 'success', diff: { added: 12, removed: 3 } },
    attributes: { tool_use_id: 'toolu_01HXKQ3F8M', cwd: '~/code/leibniz-platform' },
  },
};

// ─── trace nodes by id ───────────────────────────────────────────────────────

// ─── dashboard chart series ──────────────────────────────────────────────────

// 14-day token chart: stacked opus/sonnet/haiku
function gen14Days() {
  const days = [];
  const base = new Date('2026-04-19');
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 24 * 3600 * 1000);
    const opus    = Math.round(80000 + Math.random() * 220000);
    const sonnet  = Math.round(380000 + Math.random() * 580000);
    const haiku   = Math.round(40000 + Math.random() * 90000);
    days.push({
      day: `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      label: String(d.getDate()),
      opus, sonnet, haiku,
      total: opus + sonnet + haiku,
      cost: (opus * 18.75 + sonnet * 4.5 + haiku * 1.25) / 1e6,
      today: i === 0,
    });
  }
  return days;
}
const CHART_14D = gen14Days();

// tokens by project
const TOKENS_BY_PROJECT = [
  { project: 'leibniz-platform',  tokens: 12_400_000, sessions: 23, cost: 124.18, share: 0.62 },
  { project: 'acme-web',          tokens:  4_200_000, sessions: 11, cost:  41.20, share: 0.21 },
  { project: 'internal-tools',    tokens:  2_400_000, sessions:  7, cost:  19.84, share: 0.12 },
  { project: 'autoresearch',      tokens:    900_000, sessions:  4, cost:   8.42, share: 0.05 },
];

// dashboard kpi sparklines (12 points)
const SPARK_COST = [0.18, 0.32, 0.41, 0.28, 0.52, 0.61, 0.74, 0.58, 0.69, 0.82, 0.91, 1.04];
const SPARK_TOKENS = [820, 1240, 1480, 1120, 1840, 1620, 2240, 1980, 2120, 2480, 2640, 2820];
const SPARK_CACHE = [0.41, 0.52, 0.58, 0.64, 0.61, 0.72, 0.74, 0.78, 0.81, 0.83, 0.82, 0.83];
const SPARK_SESSIONS = [3, 5, 4, 6, 7, 5, 8, 6, 9, 7, 8, 11];

// ─── settings ────────────────────────────────────────────────────────────────

const HOOKS = [
  { name: 'PreToolUse', status: 'ok', calls: 142, last: '12s ago' },
  { name: 'PostToolUse', status: 'ok', calls: 138, last: '12s ago' },
  { name: 'Stop', status: 'ok', calls: 47, last: '4m ago' },
  { name: 'SessionStart', status: 'ok', calls: 7, last: '2h ago' },
];

const MCP_SERVERS = [
  { name: 'leibniz-memory', transport: 'stdio', status: 'ok', tools: 4, calls: 28 },
  { name: 'github', transport: 'stdio', status: 'ok', tools: 12, calls: 6 },
  { name: 'filesystem', transport: 'stdio', status: 'ok', tools: 8, calls: 142 },
];

const PRICING = [
  { model: 'claude-opus-4',     input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  { model: 'claude-sonnet-4-5', input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  { model: 'claude-haiku-4-5',  input:  1.00, output:  5.00, cacheWrite:  1.25, cacheRead: 0.10 },
];

window.SESSIONS = SESSIONS;
window.CONTEXT_BUDGET = CONTEXT_BUDGET;
window.CONTEXT_ITEMS = CONTEXT_ITEMS;
window.TRACE = TRACE;
window.NODE_DETAIL = NODE_DETAIL;
window.CHART_14D = CHART_14D;
window.TOKENS_BY_PROJECT = TOKENS_BY_PROJECT;
window.SPARK_COST = SPARK_COST;
window.SPARK_TOKENS = SPARK_TOKENS;
window.SPARK_CACHE = SPARK_CACHE;
window.SPARK_SESSIONS = SPARK_SESSIONS;
window.HOOKS = HOOKS;
window.MCP_SERVERS = MCP_SERVERS;
window.PRICING = PRICING;
