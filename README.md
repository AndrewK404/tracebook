# tracebook

Local dashboard for your Claude Code (and Codex) sessions. Parses the JSONL
transcripts your CLI agents write to disk and turns them into a calm,
searchable, dark-themed UI.

```
$ uv run tracebook
tracebook · http://127.0.0.1:4178
watching ~/.claude/projects · 42 sessions indexed
```

## What it does

- **Discovers** every Claude Code session in `~/.claude/projects/**/*.jsonl`.
- **Parses** the turn-by-turn transcript: user prompts, assistant text,
  thinking, tool calls, tool results — without losing the structure.
- **Aggregates** tokens, cost, tool usage, and per-project breakdowns.
- **Watches** the filesystem and re-indexes on every new line.
- **Renders** a dashboard, a sessions list, a single-session trace view,
  and a cost screen — server-rendered HTML, no build step, zero JS framework.

## What it is not

Tracebook is an **observer**. It does not call any model API, does not proxy
OAuth tokens, does not start or stop your CLI. Inference happens inside
`claude` / `codex` / `gemini` against your own subscription. We just read
the files they leave behind.

This is **v1** of a longer roadmap (see [`docs/ROADMAP.md`](docs/ROADMAP.md))
that eventually grows into [Leibniz](https://github.com/AndrewK404/leibniz-platform):
approval inbox, workflow runner, MCP memory server, multi-agent sync. v1
focuses on doing one thing well: turning raw JSONL into a useful dashboard.

## Install

```bash
git clone https://github.com/AndrewK404/tracebook
cd tracebook
uv sync
uv run tracebook
```

Open <http://127.0.0.1:4178>.

Requirements: Python 3.11+, [uv](https://github.com/astral-sh/uv).

## Stack

- Python 3.11+ · FastAPI · Jinja2 · watchdog
- Tailwind CDN + Inter font · server-rendered HTML
- Filesystem only — no database, no queue, no cloud

## Layout

```
tracebook/
├── README.md
├── SPEC.md                  product + UX spec
├── ARCHITECTURE.md          component map and data flow
├── DESIGN.md                visual language
├── pyproject.toml
├── design/                  static HTML mockups (no daemon needed)
└── tracebook/
    ├── __main__.py          uv run tracebook entry point
    ├── app.py               FastAPI app + routes
    ├── store.py             session index + caching
    ├── settings.py          paths, port, pricing
    ├── watcher.py           watchdog observer
    ├── parsers/
    │   └── claude.py        Claude Code JSONL → typed Session/Turn
    ├── templates/           Jinja2 templates
    └── static/              tiny CSS additions
```

## License

Apache 2.0.
