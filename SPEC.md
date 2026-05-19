# tracebook — product spec

Local read-only dashboard for Claude Code and Codex CLI sessions.
Parses local agent session JSONL files and renders them as searchable
dashboards, traces, context windows, and transcripts.

This is **v0.1**: one self-contained local inspection tool.

## Non-negotiables

1. **Read-only.** Tracebook never writes inside `~/.claude/`.
2. **No model API calls.** No `anthropic`, no `openai`, no token proxying.
3. **No build step.** Tailwind via CDN, Babel-standalone for the JSX, plain
   HTML served by FastAPI + Jinja2.
4. **No database.** In-memory index, invalidated by the filesystem watcher.
5. **English-only artifacts.** Commits, comments, docstrings.
6. **Empty states are instructive** — every empty surface shows the exact
   filesystem path the user must populate.

## Screens

The app exposes four screens through a small hash-routed React shell. The
Python server supplies real data through JSON endpoints.

### 1. Dashboard `#/dashboard`

- Page header: eyebrow `dashboards / overview`, title `overview`, subtitle.
- Filter bar: provider · model · period (`7d / 14d / 30d / 90d / 180d / all`).
- KPI strip (4 columns): tokens, sessions, estimated cost, avg/session.
  Each KPI carries a sparkline and a delta vs the previous period.
- Throughput chart: stacked-bar, one bar per day in the selected period,
  segments per model family (opus / sonnet / haiku).
- Prompt-caching panel: cache-read ratio, composition bar
  (uncached / write-5m / write-1h / read), small read/write metrics.
- Tokens-by-project: donut + legend, share of spend.
- Recent activity: 5 most recent sessions in a table (session, preview,
  project, turns, cost, last) — each row links to the session detail.

### 2. Sessions `#/sessions`

- Page header with `open in claude code` button.
- Search input + filter pills: `all`, `live`, `today`, project pills.
- Layout banner showing the active variant.
- Five layout variants exposed via the tweaks panel:
  `compact` (table) · `cards` · `stacked` · `projects` · `timeline`.
- Footer line: `N of M sessions · ~/.claude/projects/`.
- Empty state when no `*.jsonl` files exist: instructs the user to run
  `claude` against any project, listing the watched directory.

### 3. Session detail `#/sessions/{id}`

Three tabs at the top: `trace` (default) · `context window` · `transcript`.

- **Trace tab** (default):
  - Three-column grid: `RunMeta` (status, cwd, branch, model, tokens,
    tools used, cost) · trace tree or waterfall · `Inspector` (input /
    output / attributes / raw tabs).
  - Trace tree shows a depth-indented call tree.
  - Waterfall mode shows the same nodes on a time axis.
  - Live sessions show a pulsing emerald dot and "live" badges.
- **Context window tab**:
  - Donut showing `used / max` with categorical breakdown (system prompt,
    system tools, mcp tools, custom agents, memory, skills, messages,
    autocompact buffer).
  - "What's in context" cards per category (custom agents, skills, mcp
    servers, memory files) listing the actual files + token counts.
  - "System tools" grid listing every Claude Code system tool with
    estimated token cost.
- **Transcript tab**:
  - Linear chronological view of user/assistant turns with embedded
    tool calls, edits, and a live status pill if the session is in flight.

### 4. Settings `#/settings`

- Filesystem paths (state db, policy, audit log, memory, claude
  transcripts, pricing) — display only in v0.1.
- Hooks: registered hook table (PreToolUse, PostToolUse, Stop,
  SessionStart) with status + call counts. v0.1 reads
  `~/.claude/settings.json` if present, otherwise displays "not
  registered".
- MCP servers: lists configured servers from `~/.claude/settings.json`
  if present.
- Pricing: editable-looking table of current `$/1M tokens`. v0.1 is
  read-only display sourced from `tracebook/pricing.py`.
- About: version, commit, claude code version detected, python
  version, license, daemon status.

## Data layer / JSON API

Every screen reads from JSON endpoints. No SSR of mutable state.

| Path                                          | Returns                                             |
|-----------------------------------------------|-----------------------------------------------------|
| `GET /api/sessions`                           | array of session summaries (newest first)           |
| `GET /api/sessions/{id}`                      | full session: meta, trace nodes, context budget     |
| `GET /api/dashboard?period=14&provider=&model=` | KPIs, chart series, project pie, recent activity  |
| `GET /api/settings`                           | hooks, mcp servers, pricing, paths                  |
| `GET /api/health`                             | `{ ok: true, sessions: <count> }`                   |

Session summary:
```jsonc
{
  "id": "01HXKQ3F8M2P9NTQVZWX4D",
  "short": "01HXKQ3F",
  "preview": "first user-message excerpt",
  "cwd": "/Users/.../code/tracebook",
  "project": "tracebook",
  "branch": "feat/policy-engine",
  "turns": 47,
  "cost": 1.84,
  "duration": "2h 14m",
  "started": "2h ago",
  "last": "now",
  "live": true,
  "status": "running",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "lastAction": "edit tracebook/store.py +12 -3",
  "tokensIn": 124180,
  "tokensOut": 32040,
  "cacheWrite": 18420,
  "cacheRead": 428890,
  "contextUsed": 253600,
  "contextMax": 1000000
}
```

Trace node:
```jsonc
{
  "id": "n42",
  "type": "assistant" | "llm" | "tool" | "skill" | "mcp",
  "name": "claude-sonnet-4-5 · synthesize",
  "start": 2620,
  "duration": 4900,
  "tokens": 6800,
  "cost": 0.022,
  "depth": 1,
  "parent": "a1",
  "live": false,
  "preview": "tracebook/store.py +12 -3"
}
```

## Acceptance criteria for v0.1

- `uv run tracebook` starts the server on `127.0.0.1:4178` with no errors.
- Visiting `/` redirects to `#/dashboard` and shows real data sourced from
  `~/.claude/projects/`.
- Every session in `~/.claude/projects/` is listed on `/sessions`.
- Clicking any session opens `/sessions/{id}` and renders the trace tab
  with at least one assistant node and one tool call.
- The waterfall mode renders without overflow and aligns the time grid.
- The context window tab shows the donut + breakdown without errors when
  data is incomplete (graceful zero-state).
- Settings shows the real paths and detected pricing table.
- An empty `~/.claude/projects/` shows the empty state with the exact path.
- No console errors in any screen.
