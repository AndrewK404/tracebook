"""
Parse a single Claude Code JSONL transcript into a Session dataclass.

The JSONL format is append-only; each line is one JSON event.  Event types
seen in practice:

    file-history-snapshot  — internal Claude Code bookkeeping (skip)
    user                   — user message (may contain tool_result blocks)
    assistant              — assistant message (text, thinking, tool_use blocks)
    system                 — system prompt/reminders
    attachment             — file attachment metadata
    summary                — compact representation after auto-compaction
    last-prompt            — persisted prompt snapshot (skip)

Token counts live in assistant events under message.usage.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


# ─── Data types ───────────────────────────────────────────────────────────────

@dataclass
class ToolCall:
    name: str
    input_preview: str = ""
    output_preview: str = ""
    duration_ms: int = 0
    tokens: int = 0


@dataclass
class TraceNode:
    id: str
    type: str          # assistant | llm | tool | skill | mcp
    name: str
    start: int         # ms from session start
    duration: int      # ms
    tokens: int
    cost: float
    depth: int
    parent: Optional[str]
    live: bool = False
    preview: str = ""
    children: list[str] = field(default_factory=list)


@dataclass
class Session:
    # identity
    id: str
    short: str
    path: Path

    # top-level meta
    cwd: str
    project: str
    branch: str
    provider: str
    model: str         # dominant model (most turns)

    # stats
    turns: int
    tokens_in: int
    tokens_out: int
    cache_write: int
    cache_read: int
    cost: float

    # UX fields
    preview: str       # first non-trivial user message
    started_at: Optional[datetime]
    last_at: Optional[datetime]
    live: bool
    status: str        # running | idle
    last_action: str   # last tool call name + diff summary
    duration_str: str

    # context window
    context_used: int
    context_max: int

    # trace
    trace_nodes: list[TraceNode] = field(default_factory=list)
    tool_calls: list[ToolCall] = field(default_factory=list)

    # transcript — raw structured turns for the transcript tab
    transcript: list[dict[str, Any]] = field(default_factory=list)


# ─── Helpers ──────────────────────────────────────────────────────────────────

_META_RE = re.compile(
    r"<local-command-caveat>.*?</local-command-caveat>|"
    r"<system-reminder>.*?</system-reminder>|"
    r"<command-name>.*?</command-name>.*?<command-args>.*?</command-args>|"
    r"<local-command-stdout>.*?</local-command-stdout>|"
    r"<[a-zA-Z][^>]*>.*?</[a-zA-Z][^>]*>",
    re.DOTALL,
)
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[mGKHF]|\x1b\].*?(?:\x07|\x1b\\)")

def _clean(text: str) -> str:
    text = _ANSI_RE.sub("", text)
    text = _META_RE.sub("", text).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:160]


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return _clean(content)
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") in ("text", "thinking"):
                    parts.append(block.get("text", ""))
        return _clean(" ".join(parts))
    return ""


def _tool_name(block: dict) -> str:
    return block.get("name", block.get("tool_name", "?"))


def _relative_time(dt: Optional[datetime], now: datetime) -> str:
    if dt is None:
        return "?"
    delta = now - dt
    s = int(delta.total_seconds())
    if s < 60:
        return "now"
    if s < 3600:
        return f"{s // 60}m ago"
    if s < 86400:
        return f"{s // 3600}h ago"
    days = s // 86400
    if days == 1:
        return "1d ago"
    if days < 7:
        return f"{days}d ago"
    return dt.strftime("%b %d")


def _duration_str(start: Optional[datetime], end: Optional[datetime]) -> str:
    if not start or not end:
        return ""
    s = int((end - start).total_seconds())
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m"
    return f"{s // 3600}h {(s % 3600) // 60}m"


# ─── Main parser ──────────────────────────────────────────────────────────────

def parse_session(path: Path) -> Optional[Session]:
    events: list[dict] = []
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return None

    if not events:
        return None

    # ── Extract session identity from first user event ──────────────────────
    session_id = path.stem
    short = session_id[:8]
    cwd = ""
    branch = ""
    started_at: Optional[datetime] = None
    last_at: Optional[datetime] = None

    for ev in events:
        if ev.get("type") == "user":
            cwd = ev.get("cwd", "")
            branch = ev.get("gitBranch", "")
            ts = ev.get("timestamp")
            if ts and not started_at:
                try:
                    started_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    pass
            break

    project = Path(cwd).name if cwd else path.parent.name.lstrip("-").replace("-", "/", 2).split("/")[-1]

    # ── Scan all events ──────────────────────────────────────────────────────
    tokens_in = tokens_out = cache_write = cache_read = 0
    turns = 0
    preview = ""
    last_action = ""
    model_counts: dict[str, int] = {}
    tool_calls: list[ToolCall] = []
    transcript_turns: list[dict] = []
    context_used = context_max = 0

    # For timing the trace nodes we need ordered timestamps
    # We'll use event positions as a proxy for relative time
    node_list: list[dict] = []   # lightweight node dicts, built into TraceNode later

    # Track pending tool_use blocks waiting for tool_result
    pending_tools: dict[str, dict] = {}  # tool_use_id → {name, input, ts_idx}
    turn_start_idx = 0

    for idx, ev in enumerate(events):
        ev_type = ev.get("type")
        ts_str = ev.get("timestamp")
        ts: Optional[datetime] = None
        if ts_str:
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                if last_at is None or ts > last_at:
                    last_at = ts
            except ValueError:
                pass

        # ── user turn ───────────────────────────────────────────────────────
        if ev_type == "user":
            msg = ev.get("message", {})
            content = msg.get("content", "")
            is_meta = ev.get("isMeta", False)
            text = _content_text(content)
            # only use non-meta, non-tool-result text as preview
            is_tool_result = isinstance(content, list) and any(
                isinstance(b, dict) and b.get("type") == "tool_result" for b in content
            )
            if text and not preview and not is_meta and not is_tool_result:
                preview = text

            # collect tool results
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        tid = block.get("tool_use_id", "")
                        if tid in pending_tools:
                            info = pending_tools.pop(tid)
                            output_text = ""
                            bc = block.get("content", "")
                            if isinstance(bc, list):
                                output_text = " ".join(b.get("text","") for b in bc if isinstance(b,dict) and b.get("type")=="text")[:200]
                            elif isinstance(bc, str):
                                output_text = bc[:200]
                            tc = ToolCall(
                                name=info["name"],
                                input_preview=info.get("input_preview",""),
                                output_preview=output_text,
                                duration_ms=0,
                                tokens=0,
                            )
                            tool_calls.append(tc)
                            last_action = info["name"]

            if text:
                transcript_turns.append({"role": "user", "text": text, "ts": ts_str or ""})
            turns += 1

        # ── assistant turn ───────────────────────────────────────────────────
        elif ev_type == "assistant":
            msg = ev.get("message", {})
            model = msg.get("model", "")
            usage = msg.get("usage", {})

            if model:
                model_counts[model] = model_counts.get(model, 0) + 1

            tokens_in     += usage.get("input_tokens", 0)
            tokens_out    += usage.get("output_tokens", 0)
            cache_write   += (
                usage.get("cache_creation_input_tokens", 0)
                + usage.get("cache_creation", {}).get("ephemeral_5m_input_tokens", 0)
                + usage.get("cache_creation", {}).get("ephemeral_1h_input_tokens", 0)
            )
            cache_read    += usage.get("cache_read_input_tokens", 0)

            # context used = sum of all token types in this message
            ctx_used = (
                usage.get("input_tokens", 0)
                + usage.get("cache_creation_input_tokens", 0)
                + usage.get("cache_read_input_tokens", 0)
            )
            if ctx_used > context_used:
                context_used = ctx_used
                # guess context_max from model name
                m = model.lower()
                if "gemini" in m or "1m" in m:
                    context_max = 1_000_000
                elif "gpt" in m or "o1" in m or "o3" in m or "o4" in m:
                    context_max = 128_000
                else:
                    context_max = 200_000  # all current Claude models

            # collect content blocks
            content = msg.get("content", [])
            text_parts = []
            for block in (content if isinstance(content, list) else []):
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype in ("text", "thinking"):
                    text_parts.append(block.get("text", "")[:300])
                elif btype == "tool_use":
                    tid = block.get("id", f"tu_{idx}")
                    tool_name = _tool_name(block)
                    inp = block.get("input", {})
                    inp_preview = ""
                    if isinstance(inp, dict):
                        # meaningful preview: command, pattern, file_path, etc.
                        for key in ("command", "pattern", "file_path", "old_string", "query", "url"):
                            if key in inp:
                                inp_preview = f"{key}: {str(inp[key])[:100]}"
                                break
                        if not inp_preview and inp:
                            first_val = next(iter(inp.values()), "")
                            inp_preview = str(first_val)[:100]
                    pending_tools[tid] = {"name": tool_name, "input_preview": inp_preview, "ts_idx": idx}
                    last_action = tool_name

            if text_parts:
                transcript_turns.append({
                    "role": "assistant",
                    "text": " ".join(text_parts)[:400],
                    "ts": ts_str or "",
                })

    # ── Determine dominant model, live status ────────────────────────────────
    model = max(model_counts, key=model_counts.get) if model_counts else ""
    # Any pending tool (no result yet) → session is live
    live = bool(pending_tools)

    # If session file was modified within the last 60s, consider it live
    try:
        mtime = path.stat().st_mtime
        if not live and (datetime.now(tz=timezone.utc).timestamp() - mtime) < 60:
            live = True
    except OSError:
        pass

    status = "running" if live else "idle"

    # ── Cost ─────────────────────────────────────────────────────────────────
    from tracebook.pricing import compute_cost
    cost = compute_cost(model, tokens_in, tokens_out, cache_write, cache_read)

    # ── Duration ─────────────────────────────────────────────────────────────
    duration = _duration_str(started_at, last_at)

    # ── Relative timestamps ──────────────────────────────────────────────────
    now = datetime.now(tz=timezone.utc)
    started_rel = _relative_time(started_at, now)
    last_rel = _relative_time(last_at, now)
    if live:
        last_rel = "now"

    # ── Build trace nodes ────────────────────────────────────────────────────
    # Produce one assistant node per turn, children = tool calls in that turn
    trace_nodes = _build_trace(events, model)

    return Session(
        id=session_id,
        short=short,
        path=path,
        cwd=cwd or f"~/{project}",
        project=project,
        branch=branch or "main",
        provider="anthropic",
        model=model or "claude",
        turns=turns,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cache_write=cache_write,
        cache_read=cache_read,
        cost=cost,
        preview=preview or "(no message)",
        started_at=started_at,
        last_at=last_at,
        live=live,
        status=status,
        last_action=last_action,
        duration_str=duration,
        context_used=context_used,
        context_max=context_max or 200_000,
        trace_nodes=trace_nodes,
        tool_calls=tool_calls,
        transcript=transcript_turns,
    )


def _build_trace(events: list[dict], dominant_model: str) -> list[TraceNode]:
    """
    Build a flat list of TraceNode objects from the event stream.

    Strategy:
      - One root "assistant.run" node spans the whole session.
      - For each assistant event: one "llm" node.
      - For each tool_use block: one "tool" node as child of the llm node.
    """
    nodes: list[TraceNode] = []
    if not events:
        return nodes

    # Find first and last timestamp
    def _ts(ev: dict) -> Optional[datetime]:
        s = ev.get("timestamp")
        if s:
            try:
                return datetime.fromisoformat(s.replace("Z", "+00:00"))
            except ValueError:
                pass
        return None

    first_ts = next((_ts(e) for e in events if _ts(e)), None)
    last_ts = None
    for e in reversed(events):
        t = _ts(e)
        if t:
            last_ts = t
            break

    total_ms = int((last_ts - first_ts).total_seconds() * 1000) if (first_ts and last_ts) else 1000

    # root node
    root_id = "a1"
    nodes.append(TraceNode(
        id=root_id, type="assistant", name="assistant.run",
        start=0, duration=total_ms, tokens=0, cost=0,
        depth=0, parent=None,
    ))

    node_idx = 0
    turn_offset = 0

    for ev in events:
        if ev.get("type") != "assistant":
            continue

        ev_ts = _ts(ev)
        offset = int((ev_ts - first_ts).total_seconds() * 1000) if (ev_ts and first_ts) else turn_offset
        msg = ev.get("message", {})
        usage = msg.get("usage", {})
        model = msg.get("model", dominant_model)
        stop_reason = msg.get("stop_reason", "")

        inp = (
            usage.get("input_tokens", 0)
            + usage.get("cache_creation_input_tokens", 0)
            + usage.get("cache_read_input_tokens", 0)
        )
        out = usage.get("output_tokens", 0)
        total_tokens = inp + out

        from tracebook.pricing import compute_cost as _cc
        llm_cost = _cc(model, usage.get("input_tokens", 0), out,
                       usage.get("cache_creation_input_tokens", 0),
                       usage.get("cache_read_input_tokens", 0))

        node_idx += 1
        llm_id = f"l{node_idx}"
        model_short = _short_model(model)

        # guess a sub-label from stop_reason / position
        if stop_reason == "tool_use":
            label = f"{model_short} · plan"
        elif stop_reason == "end_turn":
            label = f"{model_short} · respond"
        else:
            label = model_short

        llm_dur = max(100, total_tokens // 10)  # rough heuristic

        llm_node = TraceNode(
            id=llm_id, type="llm", name=label,
            start=offset, duration=llm_dur,
            tokens=total_tokens, cost=llm_cost,
            depth=1, parent=root_id,
        )
        nodes.append(llm_node)
        nodes[0].children.append(llm_id)
        nodes[0].tokens += total_tokens

        content = msg.get("content", [])
        tool_offset = offset + llm_dur
        for block in (content if isinstance(content, list) else []):
            if not isinstance(block, dict) or block.get("type") != "tool_use":
                continue
            node_idx += 1
            tid = f"t{node_idx}"
            tool_name = _tool_name(block)
            inp_d = block.get("input", {})
            preview = ""
            if isinstance(inp_d, dict):
                for key in ("command", "pattern", "file_path", "old_string", "query", "url", "description"):
                    if key in inp_d:
                        preview = f"{key}: {str(inp_d[key])[:80]}"
                        break

            tool_node = TraceNode(
                id=tid, type="tool", name=tool_name,
                start=tool_offset, duration=150,
                tokens=0, cost=0,
                depth=1, parent=root_id,
                preview=preview,
            )
            nodes.append(tool_node)
            nodes[0].children.append(tid)
            llm_node.children.append(tid)
            tool_offset += 160

        turn_offset = tool_offset + 50

    return nodes


def _short_model(model: str) -> str:
    m = model.lower()
    if "opus" in m:
        return "opus"
    if "sonnet" in m:
        return "sonnet"
    if "haiku" in m:
        return "haiku"
    if "gpt-4o-mini" in m:
        return "gpt-4o-mini"
    if "gpt-4o" in m:
        return "gpt-4o"
    if "o3" in m:
        return "o3"
    return model.split("-")[0] if model else "llm"
