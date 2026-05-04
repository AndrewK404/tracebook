# tracebook · v1 spec

> A read-only dashboard for the JSONL transcripts your local agent CLIs
> already write to disk. v1 is intentionally narrow: parse, index, display.

## Problem

When you use Claude Code, Codex, or any modern agent CLI, every turn is
appended to a JSONL file in your home directory. That file is the truth —
but it is not pleasant to read. There is no "what did I do today",
no "how much did this cost", no fast way to revisit a long session and find
the moment a tool ran.

The official CLIs render the *current* session beautifully, but everything
*past* the current REPL is just a flat file. Existing OSS dashboards
(`claude-usage`, `token-dashboard`) are good at numbers but skip the
trace view; trace viewers (`cctrace`) are good at one session but skip
the index.

Tracebook does both, in one screen language, with one binary, locally.

## Scope (v1)

In scope:

| Surface             | What it shows                                                       |
|---------------------|---------------------------------------------------------------------|
| Dashboard `/`       | KPI strip · "active now" card · recent sessions · projects chips    |
| Sessions `/sessions`| Sortable list — id, cwd, turns, cost, started, last activity        |
| Trace `/sessions/:id`| Turn-by-turn transcript with structured tool blocks + per-turn cost |
| Cost `/cost`        | KPI strip · 14-day daily chart · top 5 expensive prompts            |
| `GET /api/sessions` | JSON for refresh / scripting                                        |

Out of scope (v1 — these belong to Leibniz):

- HITL approval inbox
- MCP memory server
- Workflow YAML runner
- Multi-user, auth, OAuth
- Live SSE updates (we re-poll every 5s in v1)
- Codex / Gemini parsers (interface is ready, only Claude shipped)
- Editing — tracebook is **read-only**

## Non-functional

- **Local-first.** Binds to `127.0.0.1` only.
- **Read-only.** Tracebook never writes to `~/.claude/`.
- **No build step.** Tailwind via CDN, Inter via rsms.me, plain Jinja.
- **Cold start < 500ms** on a 200-session corpus.
- **No DB.** Index is computed in-memory and invalidated by the watcher.
- **Apache 2.0.**

## UX commitments

1. **Every empty state is instructive.** It tells the user the exact
   filesystem path to fix it. (`~/.claude/projects/` has nothing? Then the
   empty state names that path and explains.)
2. **Numbers are tabular.** Always `font-variant-numeric: tabular-nums`
   so columns line up.
3. **Mono for IDs and paths.** Sans for prose. Never mix in one cell.
4. **One accent color** (emerald) for "live / present / OK". One warn
   (amber) for awaiting state. One error (rose) for failures.
5. **No spinners.** This is local data; everything is instant. Show the
   data or show a structured empty state — never an indeterminate loader.

## Data model

A `Session` is one JSONL file. A `Turn` is a logical step in the
conversation reconstructed from the file's events:

```python
Session(
  id: str                     # UUID, the filename without .jsonl
  cwd: str                    # decoded from the parent directory name
  project_name: str           # last segment of cwd
  source_path: Path           # absolute path to the JSONL file
  size_bytes: int
  turns: list[Turn]
  started_at: datetime
  last_activity_at: datetime
  is_live: bool               # mtime within last 60s
  model: str | None
  total_cost_usd: float
  total_input_tokens: int
  total_output_tokens: int
  total_cache_read_tokens: int
  total_cache_write_tokens: int
  tool_counts: dict[str, int] # {"Read": 12, "Bash": 7, ...}
  first_user_prompt: str | None  # for list previews
)

Turn(
  index: int
  kind: Literal["user", "assistant", "tool_result", "system"]
  timestamp: datetime
  text: str | None              # extracted prose (for user/assistant)
  thinking: str | None          # extended thinking blocks
  tool_calls: list[ToolCall]    # zero or more
  tool_result: ToolResult | None
  usage: Usage | None           # only for assistant turns
  cost_usd: float
)

ToolCall(name, input, id)
ToolResult(tool_use_id, content, is_error)
Usage(input, output, cache_read, cache_write)
```

## Pricing

`tracebook/settings.py` ships a default `PRICING` table for current Claude
Sonnet/Opus/Haiku rates. User overrides via `~/.tracebook/pricing.json`
(falls back to bundled defaults if missing).

## Acceptance

v1 is done when:

- `uv run tracebook` starts on `127.0.0.1:4178` and indexes every
  Claude Code session within 1 second of cold start.
- Every screen renders without a console error, on a fresh corpus and
  on an empty corpus.
- Every empty state names the exact filesystem path to fix it.
- A session opened mid-stream by Claude Code shows up as live within
  10 seconds.
- The four screens look like the design mockups — same palette, spacing,
  typography, and rhythm.
- Total Python source ≤ 1500 lines (parser + app + store + watcher).
