# Roadmap

Tracebook starts as a single-purpose dashboard. Each milestone is shippable
on its own — no "wait for v3 to be useful".

## v1.0 (current)

- Read `~/.claude/projects/**/*.jsonl`.
- Dashboard, sessions list, single-session trace view, cost screen.
- Filesystem watcher invalidates on change.
- Pricing table with user override at `~/.tracebook/pricing.json`.

## v1.1

- Codex parser (`~/.codex/sessions/...`) sharing the same `Session` shape.
- Multi-source dashboard cards (Claude / Codex / Gemini).

## v1.2

- Live SSE updates for the trace view (replaces the periodic re-poll).
- Live tail indicator that follows new turns as they arrive.

## v1.3

- Search across sessions (`ripgrep` shells out, results paginated).
- Project-grouped sessions view.

## v1.4

- Per-skill / per-tool cost breakdowns.
- Suggestions engine (mirrors token-dashboard's flag patterns).

## v2.0 — folds into Leibniz

When tracebook becomes the read-only observability layer of
[Leibniz](https://github.com/AndrewK404/leibniz-platform), the same
parser, store, and templates power Leibniz's Sessions and Cost panes.
Leibniz adds the parts tracebook deliberately omits: HITL approval inbox,
MCP memory server, workflow runner, multi-user.

Anything past v1.4 should live in Leibniz, not here.
