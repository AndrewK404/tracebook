# Leibniz

> A local dispatcher for agent CLIs. The terminal does the work — Leibniz watches it, indexes it, and exposes a beautiful dashboard plus an MCP server for memory and workflows.

```
┌─────────────┐   observes    ┌──────────────────┐   serves    ┌──────────────┐
│  claude /   │ ───────────►  │  leibniz daemon  │ ──────────► │  Dashboard   │
│  codex CLI  │   JSONL,      │  (FastAPI)       │   HTTP/SSE  │  (browser)   │
│             │   hooks       │                  │             │              │
└─────────────┘               └────────┬─────────┘             └──────────────┘
                                       │ MCP (stdio)
                                       ▼
                              ┌──────────────────┐
                              │  Your CLI again  │
                              │  reads memory +  │
                              │  workflows back  │
                              └──────────────────┘
```

## What it is

Leibniz keeps actual agent work in your terminal — you keep running `claude`, `codex`, `aider`, whatever, with your existing subscription. Leibniz sits beside the terminal as a tiny local daemon that:

1. **Observes** every session your CLI writes to `~/.claude/projects/` (or equivalent) and surfaces it in a live dashboard.
2. **Hosts** an MCP server called `leibniz-memory` so your CLI can read user-curated memory files and trigger user-defined workflows.
3. **Stays out of the way.** No OAuth proxy, no inference markup, no model calls of its own. Your subscription, your CLI, your tokens.

## What it isn't

- Not a Claude Code clone.
- Not yet another agent framework (LangGraph, OpenAI Agents SDK, Claude Agent SDK already cover that ground).
- Not a paid token-reseller. BYOK forever.

See [PRINCIPLES.md](./PRINCIPLES.md) for the complete principle list.

## Status

Early. v0 ships:

- ✅ Local FastAPI daemon at `http://127.0.0.1:4178`
- ✅ Sessions pane — auto-populated from `~/.claude/projects/`
- ✅ Memory pane — empty until you drop files into `~/.leibniz/memory/`
- ✅ Workflows pane — empty until you drop files into `~/.leibniz/workflows/`
- ⏳ MCP server `leibniz-memory` (planned)
- ⏳ Workflow runner (planned)
- ⏳ Live updates via SSE (planned)

## Run

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/AndrewK404/leibniz-platform.git
cd leibniz-platform
uv run leibniz
```

Then open `http://127.0.0.1:4178/` in your browser.

## Layout

```
~/.leibniz/
├── memory/        # your files; the agent reads these via MCP
├── workflows/     # your YAML workflow definitions
└── sessions/      # symlinks + index of observed CLI sessions
```

Everything is plain files. `cat`-able, `git`-able, `cp`-backup-able. No database in v0.

## Docs

- [PRINCIPLES.md](./PRINCIPLES.md) — non-negotiables
- [ARCHITECTURE.md](./ARCHITECTURE.md) — runtime model
- [DESIGN.md](./DESIGN.md) — visual design system

## License

TBD — Apache 2.0 is the planned default (see PRINCIPLES.md §3).
