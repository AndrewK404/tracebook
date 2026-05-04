# CLAUDE.md

Context for any Claude Code session working in this repo.

## What this is

Tracebook is a **read-only** local dashboard for Claude Code session
transcripts. It parses `~/.claude/projects/**/*.jsonl` and renders a
dashboard, sessions list, trace view, and cost screen. Single Python
process, no DB, no build step.

This is **v1** of a longer project that grows into Leibniz. v1 = log
parser + dashboard + trace viewer. Anything else (approvals, MCP memory,
workflows, multi-user, OAuth) is **out of scope** here.

## Non-negotiables

1. **Read-only.** Tracebook never writes inside `~/.claude/`.
2. **No model API calls.** No `anthropic`, no `openai`, no token proxying.
3. **No build step.** Tailwind CDN, Inter via rsms.me, Jinja2, plain HTML.
4. **No database.** In-memory index invalidated by the watcher.
5. **English-only artifacts.** Commits, comments, docstrings.
6. **Empty states are instructive.** Every empty surface tells the user
   the exact filesystem path to fix it.

## Stack

- Python 3.11+ · FastAPI · Jinja2 · uvicorn · watchdog
- Frontend: server-rendered HTML + Tailwind CDN + Inter font
- Storage: filesystem only

## Layout

```
tracebook/
├── README.md / SPEC.md / ARCHITECTURE.md / DESIGN.md
├── pyproject.toml
├── design/                  static HTML mockups (no daemon)
└── tracebook/
    ├── __main__.py
    ├── app.py
    ├── store.py
    ├── settings.py
    ├── watcher.py
    ├── parsers/claude.py
    ├── templates/
    └── static/
```

## When implementing features

- Read `DESIGN.md` first. Zinc-950 background, zinc-900 cards, zinc-800
  borders, emerald-400 accent only. Numbers always `tabular-nums` (`.num`).
- Read `SPEC.md` for v1 scope — do not add screens that are not listed.
- The trace view is the heart of the product. It must reconstruct logical
  turns from the JSONL events, not just dump JSON.
- New empty states must include the absolute filesystem path the user
  needs to populate.

## When NOT to do here

- Do not add OAuth flows for any model provider.
- Do not call any model API from this codebase.
- Do not add a JS framework or a build pipeline.
- Do not add features that require accounts, login, or sessions.
- Do not add a database in v1.

## Reference

- Design source: `design/` (static HTML mockups, openable directly).
- Repo: `https://github.com/AndrewK404/tracebook`.
- Sister project (future): `https://github.com/AndrewK404/leibniz-platform`.
