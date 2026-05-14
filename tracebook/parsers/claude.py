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

from tracebook.parsers.tooling import compact_tool_input, tool_info


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
    input_tokens: int = 0
    output_tokens: int = 0
    cache_write: int = 0
    cache_read: int = 0
    status: str = "completed"
    children: list[str] = field(default_factory=list)
    input_payload: dict[str, Any] = field(default_factory=dict)
    output_payload: dict[str, Any] = field(default_factory=dict)
    attributes: dict[str, Any] = field(default_factory=dict)


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

    # observed extras parsed from JSONL (used by context-window panel)
    sub_agents: list[dict[str, Any]] = field(default_factory=list)   # Task tool calls
    skills_used: list[dict[str, Any]] = field(default_factory=list)  # Skill / SkillRunner calls
    mcp_tools_used: list[dict[str, Any]] = field(default_factory=list)  # mcp__server__tool calls
    memory_reads: list[str] = field(default_factory=list)            # CLAUDE.md / .claude memory paths
    compressions: int = 0
    hook_events: list[dict[str, Any]] = field(default_factory=list)


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
    if not isinstance(text, str):
        text = json.dumps(text, ensure_ascii=False) if isinstance(text, (dict, list)) else str(text or "")
    text = _ANSI_RE.sub("", text)
    text = _META_RE.sub("", text).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:160]


def _clean_full(text: Any, *, max_chars: int = 40_000) -> str:
    if not isinstance(text, str):
        text = json.dumps(text, ensure_ascii=False) if isinstance(text, (dict, list)) else str(text or "")
    text = _ANSI_RE.sub("", text)
    text = _META_RE.sub("", text)
    text = re.sub(r"data:image/[^\\s\"')>]+", "[image omitted]", text)
    lines = [re.sub(r"[ \t]+", " ", line).rstrip() for line in text.splitlines()]
    text = "\n".join(lines).strip()
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + f"\n\n[truncated {len(text) - max_chars} chars]"


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


def _content_text_full(content: Any, *, max_chars: int = 40_000) -> str:
    if isinstance(content, str):
        return _clean_full(content, max_chars=max_chars)
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") in ("text", "thinking"):
                    parts.append(block.get("text", ""))
        return _clean_full("\n\n".join(parts), max_chars=max_chars)
    return ""


def _safe_payload(value: Any, *, max_string: int = 6000, max_items: int = 40, depth: int = 0) -> Any:
    if depth > 5:
        return "..."
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if len(value) <= max_string:
            return value
        return value[:max_string] + f"... [truncated {len(value) - max_string} chars]"
    if isinstance(value, list):
        clipped = [_safe_payload(v, max_string=max_string, max_items=max_items, depth=depth + 1) for v in value[:max_items]]
        if len(value) > max_items:
            clipped.append(f"... [{len(value) - max_items} more items]")
        return clipped
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for idx, (k, v) in enumerate(value.items()):
            if idx >= max_items:
                out["..."] = f"{len(value) - max_items} more keys"
                break
            key = str(k)
            lowered = key.lower()
            if lowered in {"encrypted_content", "image", "image_url"}:
                out[key] = "[redacted large/encoded payload]"
            else:
                out[key] = _safe_payload(v, max_string=max_string, max_items=max_items, depth=depth + 1)
        return out
    return _safe_payload(str(value), max_string=max_string, max_items=max_items, depth=depth + 1)


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


def _cache_write_tokens(usage: dict[str, Any]) -> int:
    cache_creation = usage.get("cache_creation", {}) or {}
    return (
        usage.get("cache_creation_input_tokens", 0)
        + cache_creation.get("ephemeral_5m_input_tokens", 0)
        + cache_creation.get("ephemeral_1h_input_tokens", 0)
    )


def _display_tokens(
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> int:
    """Tokens shown in throughput views. Cache hits are shown separately."""
    return input_tokens + output_tokens + cache_write_tokens


def _append_transcript(rows: list[dict[str, Any]], role: str, text: str, ts: str, **extra: Any) -> bool:
    if not text:
        return False
    for recent in reversed(rows[-4:]):
        if recent.get("kind", "message") != "message":
            continue
        if recent.get("role") == role and recent.get("text") == text:
            return False
    rows.append({"role": role, "text": text, "ts": ts, **extra})
    return True


def _extract_skill_names(text: str) -> list[str]:
    if not text:
        return []
    names: list[str] = []
    ignored = {"x", "a", "an", "the", "that", "this", "specific", "relevant", "new", "existing"}
    if "### Available skills" in text:
        section = text.split("### Available skills", 1)[1]
        section = section.split("### How to use skills", 1)[0]
        for line in section.splitlines():
            m = re.match(r"\s*-\s+([A-Za-z0-9_.:@/-]+):\s+", line)
            if m:
                names.append(m.group(1))
    for m in re.finditer(r"\bUsing\s+([A-Za-z0-9_.:@/-]+)\s+skill\b", text, flags=re.I):
        candidate = m.group(1)
        if candidate.lower() not in ignored:
            names.append(candidate)
    for m in re.finditer(r"\b(?:use|using|used)\s+(?:the\s+)?`?([A-Za-z0-9_.:@/-]+)`?\s+skill\b", text, flags=re.I):
        candidate = m.group(1)
        if candidate.lower() not in ignored:
            names.append(candidate)
    return list(dict.fromkeys(names))


def _bump_named(rows: list[dict[str, Any]], name: str, **extra: Any) -> None:
    if not name:
        return
    for row in rows:
        if row.get("name") == name:
            row["calls"] = int(row.get("calls") or 0) + 1
            return
    rows.append({"name": name, "calls": 1, **{k: v for k, v in extra.items() if v not in (None, "")}})


def _extend_parent_durations(nodes: list[TraceNode]) -> None:
    by_id = {n.id: n for n in nodes}
    for node in sorted(nodes, key=lambda n: n.depth, reverse=True):
        if not node.parent or node.parent not in by_id:
            continue
        parent = by_id[node.parent]
        parent.duration = max(parent.duration, node.start + node.duration - parent.start)


def _is_live(last_at: Optional[datetime], path: Path, pending_tools: dict[str, dict]) -> bool:
    now_ts = datetime.now(tz=timezone.utc).timestamp()
    fresh_file = False
    try:
        fresh_file = (now_ts - path.stat().st_mtime) < 60
    except OSError:
        pass

    if fresh_file:
        return True

    if not pending_tools or not last_at:
        return False

    # Stale transcripts can end with an unmatched tool_use after an interrupt or
    # crash. Treat pending tools as live only while the transcript is recent.
    return (datetime.now(tz=timezone.utc) - last_at).total_seconds() < 15 * 60


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
    compressions = 0

    # extras (skills / sub-agents / mcp / memory)
    sub_agents: list[dict] = []
    skills_used: list[dict] = []
    mcp_tools_used: list[dict] = []
    memory_reads: list[str] = []
    seen_subagent_keys: set[str] = set()
    seen_skill_keys: set[str] = set()
    seen_mcp_keys: set[str] = set()

    # For timing the trace nodes we need ordered timestamps
    # We'll use event positions as a proxy for relative time
    node_list: list[dict] = []   # lightweight node dicts, built into TraceNode later

    # Track pending tool_use blocks waiting for tool_result
    pending_tools: dict[str, dict] = {}  # tool_use_id → {name, input, ts_idx}
    transcript_tools: dict[str, dict[str, Any]] = {}
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
            text = _content_text_full(content)
            # only use non-meta, non-tool-result text as preview
            is_tool_result = isinstance(content, list) and any(
                isinstance(b, dict) and b.get("type") == "tool_result" for b in content
            )
            if text and not preview and not is_meta and not is_tool_result:
                preview = _clean(text)

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
                                output_text = _clean_full(
                                    "\n\n".join(b.get("text","") for b in bc if isinstance(b,dict) and b.get("type")=="text"),
                                    max_chars=12_000,
                                )
                            elif isinstance(bc, str):
                                output_text = _clean_full(bc, max_chars=12_000)
                            tc = ToolCall(
                                name=info["name"],
                                input_preview=info.get("input_preview",""),
                                output_preview=_clean(output_text),
                                duration_ms=0,
                                tokens=0,
                            )
                            tool_calls.append(tc)
                            last_action = info["name"]
                            if tid in transcript_tools:
                                transcript_tools[tid].update({
                                    "status": "completed",
                                    "output": _safe_payload(output_text, max_string=12_000),
                                    "outputPreview": _clean(output_text),
                                })

            if text:
                _append_transcript(transcript_turns, "user", text, ts_str or "", kind="message")
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
            cache_write   += _cache_write_tokens(usage)
            cache_read    += usage.get("cache_read_input_tokens", 0)

            # context used = sum of all token types in this message
            ctx_used = (
                usage.get("input_tokens", 0)
                + usage.get("cache_creation_input_tokens", 0)
                + usage.get("cache_read_input_tokens", 0)
            )
            if ctx_used > context_used:
                context_used = ctx_used
                # guess context_max from model name + observed usage
                m = model.lower()
                if "gemini" in m or "1m" in m:
                    context_max = 1_000_000
                elif "gpt" in m or "o1" in m or "o3" in m or "o4" in m:
                    context_max = 128_000
                else:
                    # Claude: default 200k, but if the user actually exceeded 200k
                    # they have the 1M context flag enabled (Sonnet/Opus 1M tier)
                    context_max = 1_000_000 if ctx_used > 200_000 else 200_000

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
                    inp = block.get("input", {}) or {}
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
                    info = tool_info("anthropic", tool_name, inp)
                    compact_input = compact_tool_input(tool_name, inp)
                    pending_tools[tid] = {"name": tool_name, "input_preview": inp_preview, "ts_idx": idx}
                    tool_row = {
                        "role": "tool",
                        "kind": "tool",
                        "ts": ts_str or "",
                        "name": info["label"],
                        "rawName": tool_name,
                        "category": info["category"],
                        "provider": "anthropic",
                        "text": info["context"] or inp_preview or tool_name,
                        "input": _safe_payload(compact_input, max_string=12_000),
                        "toolInfo": info,
                        "status": "pending",
                    }
                    transcript_turns.append(tool_row)
                    transcript_tools[tid] = tool_row
                    last_action = tool_name

                    # ── classify: sub-agent / skill / MCP ─────────────────────
                    if tool_name == "Task" and isinstance(inp, dict):
                        sa = inp.get("subagent_type") or "general-purpose"
                        if sa not in seen_subagent_keys:
                            seen_subagent_keys.add(sa)
                            sub_agents.append({"name": sa, "calls": 1, "description": (inp.get("description") or "")[:80]})
                        else:
                            for s in sub_agents:
                                if s["name"] == sa:
                                    s["calls"] = s.get("calls", 0) + 1
                                    break
                    elif tool_name == "Skill" and isinstance(inp, dict):
                        sk = inp.get("skill") or inp.get("name") or "?"
                        if sk not in seen_skill_keys:
                            seen_skill_keys.add(sk)
                            skills_used.append({"name": sk, "calls": 1})
                        else:
                            for s in skills_used:
                                if s["name"] == sk:
                                    s["calls"] = s.get("calls", 0) + 1
                                    break
                    elif tool_name.startswith("mcp__"):
                        # mcp__servername__toolname → group by server
                        parts = tool_name.split("__", 2)
                        server = parts[1] if len(parts) >= 2 else "?"
                        if server not in seen_mcp_keys:
                            seen_mcp_keys.add(server)
                            mcp_tools_used.append({"name": server, "calls": 1, "tools": {tool_name}})
                        else:
                            for s in mcp_tools_used:
                                if s["name"] == server:
                                    s["calls"] = s.get("calls", 0) + 1
                                    s["tools"].add(tool_name)
                                    break

                    # ── detect memory reads (CLAUDE.md or .claude/ memory files) ─
                    if tool_name == "Read" and isinstance(inp, dict):
                        fp = str(inp.get("file_path", ""))
                        if ("CLAUDE.md" in fp or "/.claude/" in fp or "/memory/" in fp) and fp not in memory_reads:
                            memory_reads.append(fp)

            if text_parts:
                text = _clean_full("\n\n".join(text_parts), max_chars=40_000)
                _append_transcript(transcript_turns, "assistant", text, ts_str or "", kind="message")
                for skill in _extract_skill_names(text):
                    _bump_named(skills_used, skill, source="message")
        elif ev_type == "summary":
            compressions += 1
            summary = _clean_full(ev.get("summary") or ev.get("message") or "conversation compressed", max_chars=12_000)
            transcript_turns.append({
                "role": "system",
                "kind": "compression",
                "text": summary or "conversation compressed",
                "ts": ts_str or "",
            })

    # ── Determine dominant model, live status ────────────────────────────────
    model = max(model_counts, key=model_counts.get) if model_counts else ""
    live = _is_live(last_at, path, pending_tools)

    status = "running" if live else "idle"

    # ── Cost ─────────────────────────────────────────────────────────────────
    from tracebook.pricing import compute_cost
    cost = compute_cost(model, tokens_in, tokens_out, cache_write, cache_read, provider="anthropic")

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

    # serialize mcp tools set → count for JSON
    for s in mcp_tools_used:
        if isinstance(s.get("tools"), set):
            s["tools"] = len(s["tools"])

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
        sub_agents=sub_agents,
        skills_used=skills_used,
        mcp_tools_used=mcp_tools_used,
        memory_reads=memory_reads,
        compressions=compressions,
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
    total_ms = max(total_ms, 1000)

    tool_results: dict[str, dict[str, Any]] = {}
    for ev in events:
        if ev.get("type") != "user":
            continue
        msg = ev.get("message", {})
        content = msg.get("content", "")
        if not isinstance(content, list):
            continue
        ev_ts = _ts(ev)
        for block in content:
            if not isinstance(block, dict) or block.get("type") != "tool_result":
                continue
            tid = block.get("tool_use_id", "")
            bc = block.get("content", "")
            if isinstance(bc, list):
                output_text = " ".join(
                    b.get("text", "") for b in bc
                    if isinstance(b, dict) and b.get("type") == "text"
                )
            else:
                output_text = str(bc)
            output_text = _clean_full(output_text, max_chars=12_000)
            tool_results[tid] = {"ts": ev_ts, "output": _clean(output_text)}
            tool_results[tid]["raw_output"] = _safe_payload(output_text, max_string=12_000)

    # root node
    root_id = "a1"
    nodes.append(TraceNode(
        id=root_id, type="assistant", name="assistant.run",
        start=0, duration=total_ms, tokens=0, cost=0,
        depth=0, parent=None,
        output_payload={"status": "completed"},
        attributes={"events": len(events)},
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

        input_tokens = usage.get("input_tokens", 0)
        cache_write = _cache_write_tokens(usage)
        cache_read = usage.get("cache_read_input_tokens", 0)
        out = usage.get("output_tokens", 0)
        total_tokens = _display_tokens(input_tokens, out, cache_write)

        from tracebook.pricing import compute_cost as _cc
        llm_cost = _cc(model, input_tokens, out, cache_write, cache_read, provider="anthropic")

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

        text_preview = _content_text(msg.get("content", []))
        llm_dur = max(100, min(12_000, (total_tokens + cache_read) // 10))  # rough heuristic

        llm_node = TraceNode(
            id=llm_id, type="llm", name=label,
            start=offset, duration=llm_dur,
            tokens=total_tokens, cost=llm_cost,
            depth=1, parent=root_id,
            preview=text_preview,
            input_tokens=input_tokens,
            output_tokens=out,
            cache_write=cache_write,
            cache_read=cache_read,
            status=stop_reason or "completed",
            input_payload={
                "model": model,
                "input_tokens": input_tokens,
                "cache_write_tokens": cache_write,
                "cache_read_tokens": cache_read,
            },
            output_payload={
                "text": text_preview,
                "output_tokens": out,
                "stop_reason": stop_reason or "",
            },
            attributes={
                "timestamp": ev.get("timestamp", ""),
                "raw_usage": _safe_payload(usage),
            },
        )
        nodes.append(llm_node)
        nodes[0].children.append(llm_id)
        nodes[0].tokens += total_tokens
        nodes[0].cost += llm_cost
        nodes[0].input_tokens += input_tokens
        nodes[0].output_tokens += out
        nodes[0].cache_write += cache_write
        nodes[0].cache_read += cache_read

        content = msg.get("content", [])
        tool_offset = offset + llm_dur
        for block in (content if isinstance(content, list) else []):
            if not isinstance(block, dict) or block.get("type") != "tool_use":
                continue
            node_idx += 1
            tid = f"t{node_idx}"
            tool_name = _tool_name(block)
            inp_d = block.get("input", {})
            info = tool_info("anthropic", tool_name, inp_d)
            preview = ""
            if isinstance(inp_d, dict):
                for key in ("command", "cmd", "pattern", "file_path", "old_string", "new_string", "query", "url", "description", "prompt"):
                    if key in inp_d:
                        preview = f"{key}: {str(inp_d[key])[:80]}"
                        break
                if not preview and inp_d:
                    k, v = next(iter(inp_d.items()))
                    preview = f"{k}: {str(v)[:80]}"

            result = tool_results.get(block.get("id", ""))
            result_ts = result.get("ts") if result else None
            duration = 150
            if ev_ts and result_ts:
                duration = max(50, int((result_ts - ev_ts).total_seconds() * 1000) - llm_dur)
            status = "completed" if result else "pending"
            node_type = "mcp" if tool_name.startswith("mcp__") else "tool"
            if tool_name in {"Skill", "SkillRunner"}:
                node_type = "skill"

            tool_node = TraceNode(
                id=tid, type=node_type, name=info["label"],
                start=tool_offset, duration=duration,
                tokens=0, cost=0,
                depth=2, parent=llm_id,
                preview=info["context"] or preview or (result or {}).get("output", ""),
                live=status == "pending",
                status=status,
                input_payload=_safe_payload(compact_tool_input(tool_name, inp_d), max_string=12_000),
                output_payload={
                    "result": (result or {}).get("raw_output", ""),
                    "preview": (result or {}).get("output", ""),
                },
                attributes={
                    "tool": info,
                    "tool_use_id": block.get("id", ""),
                    "timestamp": ev.get("timestamp", ""),
                    "result_timestamp": result_ts.isoformat() if result_ts else "",
                },
            )
            nodes.append(tool_node)
            llm_node.children.append(tid)
            tool_offset += duration + 10
            llm_node.duration = max(llm_node.duration, tool_offset - offset)

        turn_offset = tool_offset + 50

    _extend_parent_durations(nodes)
    return nodes


def _short_model(model: str) -> str:
    m = model.lower()
    if "opus" in m:
        return "opus"
    if "sonnet" in m:
        return "sonnet"
    if "haiku" in m:
        return "haiku"
    if "gpt-5.5" in m:
        return "gpt-5.5"
    if "gpt-5.4" in m:
        return "gpt-5.4"
    if "gpt-5.3" in m:
        return "gpt-5.3"
    if "gpt-5.2" in m:
        return "gpt-5.2"
    if "gpt-5.1" in m:
        return "gpt-5.1"
    if "gpt-5" in m:
        return "gpt-5"
    if "gpt-4o-mini" in m:
        return "gpt-4o-mini"
    if "gpt-4o" in m:
        return "gpt-4o"
    if "o3" in m:
        return "o3"
    return model.split("-")[0] if model else "llm"
