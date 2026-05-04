# tracebook · architecture

Single Python process. Two background pieces: an HTTP server (FastAPI) and
a filesystem watcher (watchdog). Everything reads from `~/.claude/projects/`
and never writes back.

## Topology

```
┌────────────────┐                    ┌──────────────────────────┐
│   You          │                    │   Browser                │
│  (terminal)    │                    │  127.0.0.1:4178          │
└───────┬────────┘                    └────────────┬─────────────┘
        │ runs                                     │ HTTP
        ▼                                          │
┌────────────────┐                    ┌────────────▼─────────────┐
│ claude / codex │  appends JSONL     │   tracebook (uvicorn)    │
│  CLI session   │ ──────────────────►│                          │
└────────────────┘                    │  ┌────────────────────┐  │
                                      │  │  watcher.py        │  │
            ~/.claude/projects/       │  │  watchdog.Observer │  │
                    │                 │  └─────────┬──────────┘  │
                    └────────────────►│            │ invalidates │
                                      │  ┌─────────▼──────────┐  │
                                      │  │  store.py          │  │
                                      │  │  in-memory index   │  │
                                      │  └─────────┬──────────┘  │
                                      │            │             │
                                      │  ┌─────────▼──────────┐  │
                                      │  │  app.py (FastAPI)  │  │
                                      │  │  Jinja2 routes     │  │
                                      │  └────────────────────┘  │
                                      └──────────────────────────┘
```

## Modules

### `parsers/claude.py`

Pure function: `parse_session(path: Path) -> Session`.

- Reads the JSONL line by line. Tolerates malformed lines (skipped, not
  raised).
- Groups raw events into logical `Turn`s:
  - A `user` event → `Turn(kind="user")`. If its content is a list of
    `tool_result` blocks, it becomes `kind="tool_result"`.
  - An `assistant` event → `Turn(kind="assistant")`. Walks the content
    blocks: `text` → `text`; `thinking` → `thinking`; `tool_use` →
    appended to `tool_calls`. The assistant's `usage` is captured.
- Skips housekeeping events (`permission-mode`, `file-history-snapshot`,
  `last-prompt`, `queue-operation`, `attachment`).
- Computes per-turn cost from the `usage` block and the pricing table
  for the session's model.

### `store.py`

Module-level cache keyed by absolute path → `Session`. Public surface:

```python
list_sessions() -> list[Session]    # newest first
get_session(session_id) -> Session  # raises LookupError on miss
get_kpis() -> Kpis                  # totals for the dashboard
get_projects() -> list[ProjectChip] # cwd → session count
top_prompts(window: str = "today", n: int = 5) -> list[PromptCost]
daily_cost_series(days: int = 14) -> list[DailyCost]
```

Index is rebuilt lazily — on read if the index is empty, or after the
watcher pushes an invalidation. We never re-parse a file unless its
`mtime` has changed.

### `watcher.py`

Wraps `watchdog.Observer`. Watches `~/.claude/projects/` recursively,
debounces filesystem events to 200ms, and calls `store.invalidate(path)`
for each touched JSONL.

Falls back to a poll-based `PollingObserver` on platforms where the
native FS notifier is unreliable (containers, network mounts).

### `app.py`

FastAPI + Jinja2. Routes:

| Method | Path                | Renders                                      |
|--------|---------------------|----------------------------------------------|
| GET    | `/`                 | `dashboard.html`                             |
| GET    | `/sessions`         | `sessions.html`                              |
| GET    | `/sessions/{id}`    | `session_detail.html`                        |
| GET    | `/cost`             | `cost.html`                                  |
| GET    | `/api/sessions`     | JSON for refresh / scripting                 |
| GET    | `/healthz`          | `{"ok": true}` for liveness                  |
| GET    | `/static/*`         | tiny CSS file                                |

### `settings.py`

Centralizes:

- `CLAUDE_PROJECTS = Path.home() / ".claude" / "projects"`
- `TRACEBOOK_HOME = Path.home() / ".tracebook"`
- `HOST = "127.0.0.1"`, `PORT = 4178`
- `PRICING` table (Claude Sonnet/Opus/Haiku) with override from
  `~/.tracebook/pricing.json` if present.

## Request flow (a single page render)

1. Browser hits `GET /sessions`.
2. `app.py` calls `store.list_sessions()`.
3. `store` checks if the index is empty → walks
   `~/.claude/projects/**/*.jsonl`, parses each via
   `parsers.claude.parse_session`, caches by path.
4. Returns a list sorted by `last_activity_at desc`.
5. `app.py` hands the list to Jinja and renders `sessions.html`.
6. While the user reads, the watcher receives an FS event for the active
   session. It calls `store.invalidate(path)`. The next request re-parses
   only that file.

## Why this shape

- **Filesystem is the ABI.** Anyone can `cat`, `git diff`, or back up the
  data tracebook works on. No magic state we own.
- **One process.** `uv run tracebook` is the entire deployment. No daemon
  manager, no service file, no second binary.
- **Read-only.** A bug in tracebook can't corrupt a Claude session.
- **No model API calls.** Tracebook never hits `api.anthropic.com`. All
  inference is the user's CLI against the user's subscription.

## Roadmap

- v1.0 — Sessions, Cost, Trace view (this release).
- v1.1 — Codex parser (`~/.codex/sessions/`) sharing the same `Session`
  shape.
- v1.2 — Live SSE updates for the trace view (replaces the 5s poll).
- v1.3 — Search across sessions (`ripgrep` shelling out is fine).
- v2.0 — Becomes the read layer of [Leibniz](https://github.com/AndrewK404/leibniz-platform).
