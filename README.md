# tracebook

Local dashboard for Claude Code (and other CLI agents) sessions. Parses the
JSONL transcripts your agents write to disk and renders a calm, dark-themed
dashboard with trace inspection and cost analytics.

```
$ uv run tracebook
tracebook · http://127.0.0.1:4178
watching ~/.claude/projects · 684 sessions indexed
```

## What it does

- **Discovers** every Claude Code session in `~/.claude/projects/**/*.jsonl`.
- **Parses** each transcript: user prompts, assistant turns, tool calls, usage
  tokens, cost — without touching any API.
- **Aggregates** tokens, cost, cache performance, and per-project breakdowns.
- **Watches** the filesystem and re-indexes on every write.
- **Renders** four screens in a beautiful dark dashboard:
  - Dashboard — KPIs, throughput chart, cache ratio, project pie.
  - Sessions — filterable list with compact / card / stacked / grouped layouts.
  - Session detail — call tree, waterfall, context window breakdown, transcript.
  - Settings — paths, hooks, MCP servers, pricing table.

## What it is not

Tracebook is a **read-only observer**. It never calls any model API, never
proxies tokens, and never writes inside `~/.claude/`.

This is **v0.1** of a longer roadmap that eventually grows into
[Leibniz](https://github.com/AndrewK404/leibniz-platform): MCP memory server,
workflow orchestration, approval inbox. v0.1 does one thing well: turn raw
JSONL into a useful dashboard.

## Install

```bash
git clone https://github.com/AndrewK404/tracebook
cd tracebook
uv sync
uv run tracebook
```

Open <http://127.0.0.1:4178>.

**Requirements:** Python 3.11+, [uv](https://github.com/astral-sh/uv).

## Stack

- Python 3.11+ · FastAPI · Jinja2 · watchdog
- React 18 + Babel-standalone + Tailwind CDN · server-rendered data
- Filesystem only — no database, no queue, no cloud

## Layout

```
tracebook/
├── README.md
├── SPEC.md               product + UX spec
├── ARCHITECTURE.md       component map and data flow
├── DESIGN.md             visual language
├── pyproject.toml
├── claude-design/        design source — HTML mockup + JSX
└── tracebook/
    ├── __main__.py
    ├── app.py            FastAPI routes + JSON API
    ├── store.py          session index + caching
    ├── settings.py       paths, port
    ├── pricing.py        model cost table
    ├── watcher.py        watchdog observer
    ├── parsers/claude.py Claude Code JSONL → typed Session
    ├── templates/        Jinja2 shell template
    └── static/           CSS + JSX assets
```

## License

Apache 2.0.
# ml-sandbox
