# Leibniz — Architecture

The minimum viable runtime. Everything sits on the filesystem. There is no database in v0.

## Topology

```
┌──────────────────┐                                 ┌─────────────────────────┐
│   You            │                                 │   Browser               │
│   (terminal)     │                                 │   (any modern)          │
└────────┬─────────┘                                 └───────────┬─────────────┘
         │ runs                                                  │ http://127.0.0.1:4178
         ▼                                                       │
┌──────────────────┐                                 ┌───────────▼─────────────┐
│  claude / codex  │  appends JSONL                  │   leibniz-daemon        │
│  CLI (your sub)  │ ───────────────────►            │   (FastAPI / uvicorn)   │
└──────────────────┘                                 │                         │
                          ~/.claude/projects/        │   ┌─────────────────┐   │
                                  │                  │   │  FS Watcher     │   │
                                  └─────────────────►│   │  (watchdog)     │   │
                                                     │   └────────┬────────┘   │
                                                     │            │            │
                                                     │   ┌────────▼────────┐   │
                                                     │   │  Store          │   │
                                                     │   │  (read-only     │   │
                                                     │   │   filesystem)   │   │
                                                     │   └────────┬────────┘   │
                                                     │            │            │
                                                     │   ┌────────▼────────┐   │
                                                     │   │  HTTP routes    │   │
                                                     │   │  (Jinja2)       │   │
                                                     │   └─────────────────┘   │
                                                     │   ┌─────────────────┐   │
                                                     │   │  MCP server     │   │
                                                     │   │  "leibniz-      │   │
                                                     │   │   memory"       │◄──┼── claude CLI
                                                     │   │  (stdio)        │   │   reads memory
                                                     │   └─────────────────┘   │   files back
                                                     └─────────────────────────┘
```

## Filesystem layout

Two directories, both owned by the user:

```
~/.claude/projects/                    (Claude Code writes; we only read)
├── -Users-andrew-vs-code-...           ← cwd-encoded
│   ├── <session-uuid>.jsonl            ← appended on every turn
│   └── <another-session>.jsonl

~/.leibniz/                            (we manage)
├── sessions/                           ●●●  AUTO
│   ├── 2026-05-02_15-12__c7e2.jsonl   ← symlink to a Claude Code transcript
│   └── index.json                     ← list with previews + metadata
├── memory/                             ⌀   USER-managed
│   └── (drop *.md / *.json here)
└── workflows/                          ⌀   USER-managed
    └── (drop *.yaml here)
```

## Components

### 1. FS Watcher

- Library: [watchdog](https://pypi.org/project/watchdog/) (cross-platform).
- Watches `~/.claude/projects/` recursively for `*.jsonl` create / modify.
- On event: regenerates the symlink in `~/.leibniz/sessions/` and rewrites `index.json` (atomic temp + rename).

### 2. Store (`leibniz/store.py`)

Pure read-only file-system operations behind a small interface:

```python
list_sessions() -> list[Session]           # newest first
get_session(session_id) -> Session         # full transcript on demand
list_memory() -> list[MemoryFile]
read_memory(name) -> str
list_workflows() -> list[Workflow]
read_workflow(name) -> str
```

No caching beyond the OS page cache. No locks. No DB.

### 3. HTTP routes (`leibniz/app.py`)

FastAPI + Jinja2 templates + Tailwind CDN. Routes:

| Path                | Renders                |
|---------------------|------------------------|
| `GET /`             | dashboard (overview)   |
| `GET /sessions`     | sessions list          |
| `GET /sessions/{id}`| single session view    |
| `GET /memory`       | memory files list      |
| `GET /memory/{name}`| memory file view       |
| `GET /workflows`    | workflows list         |
| `GET /workflows/{name}` | workflow view      |
| `GET /api/sessions` | JSON for XHR / SSE     |

All HTML server-rendered. No SPA. No build step.

### 4. MCP server `leibniz-memory` (planned)

stdio JSON-RPC. Tools exposed:

- `memory.list()` → list of file names
- `memory.read(name)` → file content
- `memory.search(query)` → simple grep

Registered in `~/.claude/settings.json` once the user runs `leibniz install-mcp`.

### 5. Workflow runner (planned)

Each `*.yaml` in `~/.leibniz/workflows/` declares a trigger and steps. The runner spawns the appropriate CLI (`claude`, `codex`) for each step and records the resulting transcript back through the FS Watcher.

## Why this shape

- **Filesystem as the ABI.** Anyone can `cat`, `vim`, `git diff` what Leibniz sees. No magic state.
- **One process.** `uv run leibniz` is the entire deployment.
- **Zero auth in v0.** Binds to `127.0.0.1` only. Multi-user / OIDC arrives in v2 team mode.
- **Nothing intercepts the model API.** Inference happens inside `claude` / `codex`, against the user's subscription. We never proxy tokens.

## Roadmap

- v0.1 — Sessions + Memory + Workflows panes, FS Watcher, beautiful dashboard.
- v0.2 — `leibniz-memory` MCP server.
- v0.3 — Workflow runner with cron + manual triggers.
- v0.4 — SSE-driven live updates in the dashboard.
- v1.0 — A Postgres + Graphiti opt-in for users who want temporal memory + governance.
