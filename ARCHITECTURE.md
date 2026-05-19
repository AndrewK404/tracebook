# tracebook — architecture

Single Python process, no DB, no build step. Filesystem is the ABI.

## Topology

```
┌──────────────────┐                                 ┌─────────────────────────┐
│  claude / codex  │  appends JSONL                  │   tracebook (FastAPI)   │
│  CLI (your sub)  │ ───────────────────►            │                         │
└──────────────────┘   ~/.claude/projects/           │   ┌─────────────────┐   │
                                  │                  │   │  FS Watcher     │   │
                                  └─────────────────►│   │  (watchdog)     │   │
                                                     │   └────────┬────────┘   │
                                                     │            │            │
                                                     │   ┌────────▼────────┐   │
                                                     │   │  Store          │   │
                                                     │   │  (read-only,    │   │
                                                     │   │   mtime-cached) │   │
                                                     │   └────────┬────────┘   │
                                                     │            │            │
                                                     │   ┌────────▼────────┐   │
                                                     │   │  HTTP routes    │◄──┼── browser
                                                     │   │  (FastAPI +     │   │   http://127.0.0.1:4178
                                                     │   │   Jinja2 +      │   │
                                                     │   │   JSON API)     │   │
                                                     │   └─────────────────┘   │
                                                     └─────────────────────────┘
```

## Modules

```
tracebook/
├── __main__.py        uv run tracebook entry point
├── app.py             FastAPI app, routes, JSON API
├── settings.py        paths, port, pricing defaults
├── store.py           read-only filesystem session index
├── watcher.py         watchdog observer, invalidates store cache
├── pricing.py         model → $/1M tokens, cost calculator
├── parsers/
│   └── claude.py      JSONL → typed Session / Trace
├── templates/
│   └── index.html     SPA shell — bootstraps the React design
└── static/
    ├── css/app.css    application styles
    └── js/            JSX modules served by Babel-standalone
        ├── icons.jsx
        ├── primitives.jsx
        ├── shell.jsx
        ├── tweaks-panel.jsx
        ├── data.jsx          ← rewritten to fetch from /api/*
        ├── app.jsx
        └── screens/
            ├── dashboard.jsx
            ├── sessions.jsx
            ├── session_detail.jsx
            └── settings.jsx
```

## Why a "React in the browser" shell

The UI ships as a React + Babel + Tailwind-CDN shell.
Reproducing it in Jinja2 would lose fidelity and double the work.
Instead:

- The Python server owns parsing, indexing, and pricing.
- The browser owns rendering, exactly as drawn in the design.
- The two communicate over a small JSON API (six endpoints).
- There is still **no build step**: Babel transpiles JSX in the browser.

This keeps the design source of truth one-to-one with what ships, while
keeping the server logic in Python.

## Data flow

1. On startup, `Store.refresh()` walks `~/.claude/projects/`, parses
   every `*.jsonl` once, and builds an in-memory `dict[session_id, Session]`.
2. `Watcher` registers with watchdog; on `created` / `modified` events it
   invalidates the cached `Session` for the file mtime that changed.
3. HTTP requests hit `Store` directly. Reads are O(1) (dict) for summaries
   and O(file) for full session detail (trace + transcript).
4. Browser fetches `/api/*` JSON, populates `window.SESSIONS` etc., and
   the React design renders.

## File-system layout

```
~/.claude/projects/                    (Claude Code writes; we only read)
└── -Users-andrew-vs-code-...
    └── <session-uuid>.jsonl           ← one session per file

~/.tracebook/                          (tracebook writes — optional)
└── hooks.jsonl                        ← optional hook-capture events
```

In v0.1 the only state tracebook needs is in memory; the `~/.tracebook/`
directory is created lazily and remains empty by default.

## Configuration

- Port: `127.0.0.1:4178` — fixed in v0.1, override via `TRACEBOOK_PORT`.
- Claude projects path: `~/.claude/projects/` — override via `TRACEBOOK_CLAUDE_PROJECTS`.
- All other config is on disk.
