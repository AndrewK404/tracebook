"""
Parse Codex archived rollout JSONL into the shared Session shape.

Codex transcripts are append-only JSONL files under ~/.codex/sessions.
Token usage appears in event_msg/token_count events.  The cumulative totals
can reset across compactions/forks, so per-call accounting uses
last_token_usage when present.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from tracebook.parsers.claude import (
    Session,
    ToolCall,
    TraceNode,
    _clean,
    _clean_full,
    _duration_str,
    _relative_time,
    _safe_payload,
    _short_model,
)
from tracebook.parsers.tooling import compact_tool_input, jsonish, tool_info
from tracebook.pricing import compute_cost
from tracebook.settings import settings


_CODEX_SESSION_PATH_CACHE: dict[str, Optional[Path]] = {}
_CODEX_SESSION_PATH_INDEX: Optional[dict[str, Path]] = None
_SESSION_ID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def _codex_transcript_search_roots() -> list[Path]:
    roots: list[Path] = []
    for base in (settings.codex_sessions, settings.codex_archive_sessions):
        candidates = [base]
        if base.name == ".codex":
            candidates = [base / "sessions", base / "archived_sessions"]
        for root in candidates:
            if root not in roots:
                roots.append(root)
    return roots


def _ts(value: Optional[str | int | float]) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, (int, float)):
        try:
            # Codex has emitted both epoch seconds and epoch milliseconds.
            seconds = value / 1000 if value > 10_000_000_000 else value
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (OSError, OverflowError, ValueError):
            return None
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return _clean(content)
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") in ("input_text", "output_text", "summary_text", "text"):
                parts.append(item.get("text", ""))
        return _clean(" ".join(parts))
    return ""


def _content_text_full(content: Any, *, max_chars: int = 40_000) -> str:
    if isinstance(content, str):
        return _clean_full(content, max_chars=max_chars)
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") in ("input_text", "output_text", "summary_text", "text"):
                parts.append(item.get("text", ""))
        return _clean_full("\n\n".join(parts), max_chars=max_chars)
    return ""


def _raw_content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") in ("input_text", "output_text", "summary_text", "text"):
                parts.append(item.get("text", ""))
        return "\n\n".join(parts)
    return ""


def _context_text_fingerprint(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _context_message_timestamp_ms(message: dict[str, Any]) -> Optional[int]:
    ts = _ts(message.get("timestamp"))
    if not ts:
        return None
    return int(ts.timestamp() * 1000)


def _context_messages_similar(left: dict[str, Any], right: dict[str, Any]) -> bool:
    if left.get("role") != right.get("role"):
        return False
    if left.get("type") != right.get("type"):
        return False
    if left.get("call_id") or right.get("call_id"):
        return left.get("call_id") == right.get("call_id")
    left_text = _context_text_fingerprint(left.get("content"))
    right_text = _context_text_fingerprint(right.get("content"))
    if not left_text or not right_text:
        return False
    left_ts = _context_message_timestamp_ms(left)
    right_ts = _context_message_timestamp_ms(right)
    if left_ts is not None and right_ts is not None and abs(left_ts - right_ts) > 5_000:
        return False
    if left_text == right_text:
        return True
    shortest = min(len(left_text), len(right_text))
    return shortest >= 40 and (left_text in right_text or right_text in left_text)


def _append_context_message(messages: list[dict[str, Any]], message: dict[str, Any]) -> None:
    for index, existing in enumerate(messages):
        if not _context_messages_similar(existing, message):
            continue
        if len(str(message.get("content") or "")) > len(str(existing.get("content") or "")):
            messages[index] = message
        return
    messages.append(message)


def _new_codex_context_state() -> dict[str, Any]:
    return {"instructions": [], "messages": [], "turn_context": {}}


def _append_codex_context_event(state: dict[str, Any], ev: dict[str, Any]) -> None:
    typ = ev.get("type")
    payload = ev.get("payload", {}) or {}
    timestamp = ev.get("timestamp", "")
    instructions = state["instructions"]
    messages = state["messages"]
    if typ == "session_meta":
        for field in ("base_instructions", "developer_instructions", "user_instructions"):
            value = payload.get(field)
            if isinstance(value, dict):
                value = value.get("text") or value
            if value:
                instructions.append({
                    "role": field.replace("_instructions", ""),
                    "content": _safe_payload(value, max_string=80_000, max_items=120),
                })
        return
    if typ == "turn_context":
        state["turn_context"].update(_safe_payload(payload, max_string=80_000, max_items=120))
        return
    if typ == "event_msg":
        ptype = payload.get("type")
        if ptype == "user_message":
            text = _clean_full(payload.get("message") or "", max_chars=80_000)
            if text and not _is_meta_text(text):
                _append_context_message(messages, {"role": "user", "timestamp": timestamp, "content": text})
        elif ptype == "agent_message":
            text = _clean_full(payload.get("message") or "", max_chars=80_000)
            if text:
                _append_context_message(messages, {"role": "assistant", "timestamp": timestamp, "content": text})
        elif ptype == "context_compacted":
            _append_context_message(messages, {"role": "system", "timestamp": timestamp, "content": "conversation compressed"})
        return
    if typ != "response_item":
        return
    rtype = payload.get("type")
    if rtype == "message":
        role = payload.get("role") or "message"
        text = _content_text_full(payload.get("content"), max_chars=80_000)
        if text and not (role == "user" and _is_meta_text(text)):
            _append_context_message(messages, {"role": role, "timestamp": timestamp, "content": text})
    elif rtype in ("function_call", "custom_tool_call", "web_search_call"):
        messages.append({
            "role": "assistant",
            "timestamp": timestamp,
            "type": rtype,
            "name": payload.get("name") or payload.get("type") or "tool",
            "call_id": payload.get("call_id") or payload.get("id") or "",
            "arguments": _safe_payload(payload.get("arguments") or payload.get("input") or payload.get("action") or {}, max_string=80_000, max_items=120),
        })
    elif rtype in ("function_call_output", "custom_tool_call_output"):
        messages.append({
            "role": "tool",
            "timestamp": timestamp,
            "type": rtype,
            "call_id": payload.get("call_id") or payload.get("id") or "",
            "output": _safe_payload(payload.get("output") or payload.get("result") or "", max_string=80_000, max_items=120),
        })
    elif rtype == "reasoning":
        text = _content_text_full(payload.get("summary") or [], max_chars=80_000)
        if text:
            _append_context_message(messages, {"role": "assistant", "timestamp": timestamp, "type": "reasoning", "content": text})


def _codex_context_snapshot(state: dict[str, Any], model: str) -> dict[str, Any]:
    return {
        "source": "log_replay",
        "capture": "reconstructed_before_model",
        "model": model,
        "instructions": [dict(item) for item in state["instructions"]],
        "turn_context": dict(state["turn_context"]),
        "messages": [dict(item) for item in state["messages"]],
        "note": "Reconstructed by walking Codex rollout events before this model step. Hook capture replaces this with the exact model request when available.",
    }


def _model_input_from_codex_events(events: list[dict[str, Any]], event_index: int, model: str) -> dict[str, Any]:
    state = _new_codex_context_state()
    for ev in events[:event_index]:
        _append_codex_context_event(state, ev)
    return _codex_context_snapshot(state, model)


def _jsonish(value: Any) -> Any:
    return jsonish(value)


def _preview_from_payload(value: Any) -> str:
    value = _jsonish(value)
    if isinstance(value, dict):
        if "chars" in value:
            chars = value.get("chars")
            return f"input: {_clean(str(chars))}" if chars not in (None, "") else ""
        for key in ("cmd", "command", "query", "url", "file_path", "pattern", "input", "text"):
            if key in value:
                return f"{key}: {_clean(str(value[key]))}"
        if value:
            k, v = next(iter(value.items()))
            return f"{k}: {_clean(str(v))}"
    return _clean(str(value or ""))


def _is_meta_text(text: str) -> bool:
    lowered = (text or "").lower()
    return (
        "<environment_context>" in lowered
        or "</environment_context>" in lowered
        or lowered.startswith("# context from my ide setup")
    )


def _usage_tokens(usage: dict[str, Any]) -> tuple[int, int, int]:
    input_tokens = int(usage.get("input_tokens") or 0)
    cached = int(usage.get("cached_input_tokens") or 0)
    output = int(usage.get("output_tokens") or 0)
    return max(input_tokens - cached, 0), cached, output


def _usage_signature(usage: dict[str, Any]) -> tuple[int, int, int, int, int]:
    return (
        int(usage.get("input_tokens") or 0),
        int(usage.get("cached_input_tokens") or 0),
        int(usage.get("output_tokens") or 0),
        int(usage.get("reasoning_output_tokens") or 0),
        int(usage.get("total_tokens") or 0),
    )


def _load_codex_events(path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    try:
        with path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return []
    return events


def _codex_session_meta_ids(events: list[dict[str, Any]]) -> list[str]:
    ids: list[str] = []
    for ev in events:
        if ev.get("type") != "session_meta":
            continue
        sid = str((ev.get("payload") or {}).get("id") or "")
        if sid:
            ids.append(sid)
    return ids


def _is_codex_subagent_session(events: list[dict[str, Any]]) -> bool:
    ids = _codex_session_meta_ids(events)
    return bool(len(ids) > 1 and ids[0] and any(sid and sid != ids[0] for sid in ids[1:]))


def _extract_agent_id(value: Any) -> str:
    parsed = _jsonish(value)
    if isinstance(parsed, dict):
        return str(parsed.get("agent_id") or parsed.get("id") or "")
    text = str(value or "")
    match = re.search(r'"agent_id"\s*:\s*"([^"]+)"', text)
    return match.group(1) if match else ""


def _output_wall_time_ms(output: Any) -> Optional[int]:
    match = re.search(r"\bWall time:\s*([0-9.]+)\s*seconds\b", str(output or ""), flags=re.I)
    if not match:
        return None
    try:
        return max(1, int(float(match.group(1)) * 1000))
    except ValueError:
        return None


def _tool_output_status(output: Any, fallback: str = "completed") -> str:
    text = str(output or "")
    exit_match = re.search(r"\bProcess exited with code\s+(-?\d+)\b", text)
    if exit_match:
        return "completed" if exit_match.group(1) == "0" else "error"
    if "Process running with session ID" in text:
        return "running"
    return fallback


def _tool_session_id(parsed_input: Any, output: Any = None) -> str:
    parsed = _jsonish(parsed_input)
    if isinstance(parsed, dict) and parsed.get("session_id") not in (None, ""):
        return str(parsed.get("session_id"))
    match = re.search(r"\bProcess running with session ID\s+(\d+)\b", str(output or ""))
    return match.group(1) if match else ""


def _pty_final_statuses(events: list[dict[str, Any]]) -> dict[str, str]:
    calls: dict[str, Any] = {}
    for ev in events:
        payload = ev.get("payload", {}) or {}
        if ev.get("type") != "response_item":
            continue
        if payload.get("type") not in ("function_call", "custom_tool_call"):
            continue
        call_id = payload.get("call_id") or payload.get("id") or ""
        if call_id:
            calls[call_id] = _jsonish(payload.get("arguments") or payload.get("input") or {})

    statuses: dict[str, str] = {}
    for ev in events:
        payload = ev.get("payload", {}) or {}
        if ev.get("type") != "response_item":
            continue
        if payload.get("type") not in ("function_call_output", "custom_tool_call_output"):
            continue
        call_id = payload.get("call_id") or payload.get("id") or ""
        output = payload.get("output") or payload.get("result") or ""
        session_id = _tool_session_id(calls.get(call_id, {}), output)
        if not session_id:
            continue
        status = _tool_output_status(output, "")
        if status:
            statuses[session_id] = status
    return statuses


def _resolved_tool_status(
    output: Any,
    parsed_input: Any,
    pty_final_statuses: dict[str, str],
    fallback: str = "completed",
) -> str:
    status = _tool_output_status(output, fallback)
    if status != "running":
        return status
    session_id = _tool_session_id(parsed_input, output)
    return pty_final_statuses.get(session_id, status) if session_id else status


def _shell_output_body(output: Any) -> str:
    text = str(output or "")
    match = re.search(r"\nOutput:\n(?P<body>[\s\S]*)$", text)
    return (match.group("body") if match else text).strip()


def _is_empty_poll_tool(raw_name: str, parsed_input: Any, output: Any) -> bool:
    if raw_name != "write_stdin":
        return False
    parsed = _jsonish(parsed_input)
    if isinstance(parsed, dict) and parsed.get("chars") not in (None, ""):
        return False
    return not _shell_output_body(output)


def _compact_match_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _prefix_match_text(a: str, b: str, min_length: int = 40) -> bool:
    left = _compact_match_text(a)
    right = _compact_match_text(b)
    size = min(len(left), len(right), 500)
    return size >= min_length and left[:size] == right[:size]


def _user_message_text(ev: dict[str, Any]) -> str:
    payload = ev.get("payload", {}) or {}
    if ev.get("type") == "event_msg" and payload.get("type") == "user_message":
        return _clean_full(payload.get("message") or "", max_chars=80_000)
    if ev.get("type") == "response_item" and payload.get("type") == "message" and payload.get("role") == "user":
        return _content_text_full(payload.get("content"), max_chars=80_000)
    return ""


def _token_count_signature(ev: dict[str, Any]) -> Optional[tuple[int, int, int, int, int]]:
    payload = ev.get("payload", {}) or {}
    if ev.get("type") != "event_msg" or payload.get("type") != "token_count":
        return None
    info = payload.get("info") or {}
    usage = info.get("total_token_usage") or info.get("last_token_usage") or {}
    return _usage_signature(usage) if usage else None


def _child_trace_window(
    events: list[dict[str, Any]],
    prompt_text: str,
) -> tuple[list[dict[str, Any]], Optional[tuple[int, int, int, int, int]], Optional[datetime]]:
    start_idx = 0
    if prompt_text:
        for idx, ev in enumerate(events):
            if _prefix_match_text(prompt_text, _user_message_text(ev)):
                start_idx = idx
                break

    initial_signature: Optional[tuple[int, int, int, int, int]] = None
    for ev in events[:start_idx]:
        sig = _token_count_signature(ev)
        if sig is not None:
            initial_signature = sig

    first_ts = next((_ts(e.get("timestamp")) for e in events[start_idx:] if _ts(e.get("timestamp"))), None)
    return events[start_idx:], initial_signature, first_ts


def _find_codex_session_path(session_id: str, near: Optional[Path] = None) -> Optional[Path]:
    if not session_id:
        return None
    if session_id in _CODEX_SESSION_PATH_CACHE:
        return _CODEX_SESSION_PATH_CACHE[session_id]

    if near:
        try:
            matches = sorted(near.parent.glob(f"*{session_id}*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
        except OSError:
            matches = []
        if matches:
            _CODEX_SESSION_PATH_CACHE[session_id] = matches[0]
            return matches[0]

    path = _codex_session_path_index().get(session_id)
    if path:
        _CODEX_SESSION_PATH_CACHE[session_id] = path
        return path

    _CODEX_SESSION_PATH_CACHE[session_id] = None
    return None


def _codex_session_path_index() -> dict[str, Path]:
    global _CODEX_SESSION_PATH_INDEX
    if _CODEX_SESSION_PATH_INDEX is not None:
        return _CODEX_SESSION_PATH_INDEX

    index: dict[str, Path] = {}
    mtimes: dict[str, float] = {}
    for root in _codex_transcript_search_roots():
        if not root.exists():
            continue
        try:
            paths = root.rglob("*.jsonl")
            for path in paths:
                ids = _SESSION_ID_RE.findall(path.name)
                if not ids:
                    continue
                try:
                    mtime = path.stat().st_mtime
                except OSError:
                    continue
                for session_id in ids:
                    if session_id not in mtimes or mtime > mtimes[session_id]:
                        index[session_id] = path
                        mtimes[session_id] = mtime
        except OSError:
            continue
    _CODEX_SESSION_PATH_INDEX = index
    return index


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


def _bump_named(rows: list[dict[str, Any]], name: str, **extra: Any) -> None:
    if not name:
        return
    for row in rows:
        if row.get("name") == name:
            row["calls"] = int(row.get("calls") or 0) + 1
            for key, value in extra.items():
                if key not in row and value not in (None, ""):
                    row[key] = value
            return
    rows.append({"name": name, "calls": 1, **{k: v for k, v in extra.items() if v not in (None, "")}})


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


def _extend_parent_durations(nodes: list[TraceNode]) -> None:
    by_id = {n.id: n for n in nodes}
    for node in sorted(nodes, key=lambda n: n.depth, reverse=True):
        if not node.parent or node.parent not in by_id:
            continue
        parent = by_id[node.parent]
        parent.duration = max(parent.duration, node.start + node.duration - parent.start)


def _mark_visual_noise_steps(nodes: list[TraceNode]) -> None:
    """Hide model wrapper spans whose only child work is an empty PTY poll."""
    children_by_parent: dict[str, list[TraceNode]] = {}
    for node in nodes:
        if not node.parent:
            continue
        children_by_parent.setdefault(node.parent, []).append(node)

    for node in nodes:
        if node.type != "llm":
            continue
        children = children_by_parent.get(node.id) or []
        if not children:
            continue
        if any(not ((child.attributes or {}).get("noise")) for child in children):
            continue
        output = node.output_payload or {}
        if _clean(output.get("message") or "") or _clean(output.get("reasoning_summary") or ""):
            continue
        node.attributes["visual_noise"] = True
        node.attributes["visual_noise_reason"] = "empty_pty_poll"


def parse_session(
    path: Path,
    *,
    include_trace: bool = False,
    include_transcript: bool = True,
    embed_subagents: bool = False,
) -> Optional[Session]:
    events = _load_codex_events(path)

    if not events:
        return None

    meta: dict[str, Any] = {}
    session_meta_ids: list[str] = []
    cwd = ""
    model_counts: dict[str, int] = {}
    started_at: Optional[datetime] = None
    last_at: Optional[datetime] = None
    preview = ""
    transcript: list[dict[str, Any]] = []
    tool_calls: list[ToolCall] = []
    last_action = ""
    context_used = 0
    context_max = 0
    tokens_in = 0
    tokens_out = 0
    cache_read = 0
    previous_usage_signature: Optional[tuple[int, int, int, int, int]] = None
    turns = 0
    thread_name = ""
    calls_by_id: dict[str, ToolCall] = {}
    transcript_tools: dict[str, dict[str, Any]] = {}
    sub_agents: list[dict[str, Any]] = []
    skills_used: list[dict[str, Any]] = []
    mcp_tools_used: list[dict[str, Any]] = []
    memory_reads: list[str] = []
    compacted_events = 0
    context_compacted_events = 0
    pty_final_statuses = _pty_final_statuses(events) if (include_transcript or include_trace) else {}

    for ev in events:
        ts = _ts(ev.get("timestamp"))
        if ts:
            started_at = started_at or ts
            if last_at is None or ts > last_at:
                last_at = ts

        typ = ev.get("type")
        payload = ev.get("payload", {}) or {}

        if typ == "compacted":
            compacted_events += 1
            replacement = payload.get("replacement_history") or []
            if include_transcript:
                transcript.append({
                    "role": "system",
                    "kind": "compression",
                    "text": "conversation compressed",
                    "ts": ev.get("timestamp", ""),
                    "items": len(replacement) if isinstance(replacement, list) else 0,
                })
            continue

        if typ == "session_meta":
            if not meta:
                meta = payload
            cwd = payload.get("cwd") or cwd
            session_sid = str(payload.get("id") or "")
            if session_sid:
                if session_meta_ids and session_sid != session_meta_ids[0]:
                    return None
                if not session_meta_ids:
                    session_meta_ids.append(session_sid)
            # Codex session_meta.timestamp is the session allocation time and can
            # predate the first transcript event. Keep started_at on the JSONL
            # event timeline so user markers and trace nodes share one origin.
            if include_transcript:
                for field in ("base_instructions", "developer_instructions", "user_instructions"):
                    value = payload.get(field)
                    if isinstance(value, dict):
                        value = value.get("text") or ""
                    for skill in _extract_skill_names(str(value or "")):
                        _bump_named(skills_used, skill, source="prompt")
            continue

        if typ == "turn_context":
            cwd = payload.get("cwd") or cwd
            model = payload.get("model") or ""
            if model:
                model_counts[model] = model_counts.get(model, 0) + 1
            context_max = max(context_max, int(payload.get("model_context_window") or 0))
            instructions = payload.get("user_instructions") or ""
            if include_transcript:
                for skill in _extract_skill_names(instructions):
                    _bump_named(skills_used, skill, source="prompt")
                if "AGENTS.md" in instructions and "AGENTS.md" not in memory_reads:
                    memory_reads.append("AGENTS.md")
                if "CLAUDE.md" in instructions and "CLAUDE.md" not in memory_reads:
                    memory_reads.append("CLAUDE.md")
            continue

        if typ == "event_msg":
            ptype = payload.get("type")
            if ptype == "user_message":
                raw_message = payload.get("message") or ""
                text = _clean_full(raw_message) if include_transcript else _clean(raw_message)
                if text and not _is_meta_text(text):
                    preview = preview or _clean(text)
                    if include_transcript and _append_transcript(transcript, "user", text, ev.get("timestamp", ""), kind="message"):
                        turns += 1
                    elif not include_transcript:
                        turns += 1
            elif ptype == "agent_message":
                if include_transcript:
                    text = _clean_full(payload.get("message") or "")
                    if text:
                        _append_transcript(transcript, "assistant", text, ev.get("timestamp", ""), kind="message")
                        for skill in _extract_skill_names(text):
                            _bump_named(skills_used, skill, source="message")
            elif ptype == "token_count":
                info = payload.get("info") or {}
                total_usage = info.get("total_token_usage") or {}
                last_usage = info.get("last_token_usage") or {}
                usage_for_count = last_usage or total_usage
                usage_for_signature = total_usage or last_usage
                if usage_for_count:
                    signature = _usage_signature(usage_for_signature)
                    if signature != previous_usage_signature:
                        fresh, cached, output = _usage_tokens(usage_for_count)
                        tokens_in += fresh
                        cache_read += cached
                        tokens_out += output
                        previous_usage_signature = signature
                    context_used = max(context_used, int(usage_for_count.get("input_tokens") or 0))
                context_max = max(context_max, int(info.get("model_context_window") or 0))
            elif ptype == "thread_name_updated":
                thread_name = payload.get("thread_name") or thread_name
            elif ptype == "context_compacted":
                context_compacted_events += 1
                if include_transcript and (not transcript or transcript[-1].get("kind") != "compression"):
                    transcript.append({
                        "role": "system",
                        "kind": "compression",
                        "text": "conversation compressed",
                        "ts": ev.get("timestamp", ""),
                    })
            continue

        if typ == "response_item":
            rtype = payload.get("type")
            if rtype == "message":
                role = payload.get("role")
                content = payload.get("content")
                raw_text = _raw_content_text(content) if include_transcript else ""
                text = _content_text_full(content) if include_transcript else _content_text(content)
                if role == "user" and text and not _is_meta_text(text):
                    preview = preview or _clean(text)
                    if include_transcript and _append_transcript(transcript, role, text, ev.get("timestamp", ""), kind="message"):
                        turns += 1
                    elif not include_transcript:
                        turns += 1
                if role in ("user", "assistant") and text and not (role == "user" and _is_meta_text(text)):
                    if include_transcript:
                        _append_transcript(transcript, role, text, ev.get("timestamp", ""), kind="message")
                        if role == "assistant":
                            for skill in _extract_skill_names(text):
                                _bump_named(skills_used, skill, source="message")
                elif role in ("developer", "system") and raw_text:
                    if include_transcript:
                        for skill in _extract_skill_names(raw_text):
                            _bump_named(skills_used, skill, source="context")
            elif rtype in ("function_call", "custom_tool_call"):
                name = _clean(payload.get("name") or "tool")
                call_id = payload.get("call_id") or payload.get("id") or f"call_{len(tool_calls)}"
                last_action = name
                if include_transcript:
                    raw_input = payload.get("arguments") or payload.get("input") or ""
                    parsed_input = _jsonish(raw_input)
                    tool = ToolCall(name=name, input_preview=_preview_from_payload(raw_input))
                    calls_by_id[call_id] = tool
                    tool_calls.append(tool)
                    info = tool_info("openai", name, parsed_input)
                    compact_input = compact_tool_input(name, parsed_input)
                    tool_row = {
                        "role": "tool",
                        "kind": "tool",
                        "ts": ev.get("timestamp", ""),
                        "name": info["label"],
                        "rawName": name,
                        "category": info["category"],
                        "provider": "openai",
                        "callId": call_id,
                        "text": info["context"] or tool.input_preview or name,
                        "input": _safe_payload(compact_input, max_string=12_000),
                        "toolInfo": info,
                        "status": "pending",
                        "noise": False,
                    }
                    transcript.append(tool_row)
                    transcript_tools[call_id] = tool_row
                    if name.startswith("mcp__"):
                        parts = name.split("__", 2)
                        server = parts[1] if len(parts) > 1 else "mcp"
                        _bump_named(mcp_tools_used, server, tools=1)
                    if name == "spawn_agent" and isinstance(parsed_input, dict):
                        _bump_named(sub_agents, parsed_input.get("agent_type") or "default", description=parsed_input.get("message", "")[:80])
                    if name in {"view_image", "read_mcp_resource"} and isinstance(parsed_input, dict):
                        pathish = str(parsed_input.get("path") or parsed_input.get("uri") or "")
                        if pathish and pathish not in memory_reads:
                            memory_reads.append(pathish)
            elif rtype in ("function_call_output", "custom_tool_call_output"):
                call_id = payload.get("call_id") or payload.get("id") or ""
                if include_transcript:
                    tool = calls_by_id.get(call_id)
                    output_text = _clean_full(payload.get("output") or payload.get("result") or "", max_chars=12_000)
                    if tool:
                        tool.output_preview = _clean(output_text)
                    if call_id in transcript_tools:
                        compact_input = transcript_tools[call_id].get("input") or {}
                        transcript_tools[call_id].update({
                            "status": _resolved_tool_status(output_text, compact_input, pty_final_statuses),
                            "output": _safe_payload(output_text, max_string=12_000),
                            "outputPreview": _clean(output_text),
                            "noise": _is_empty_poll_tool(transcript_tools[call_id].get("rawName") or "", compact_input, output_text),
                        })
            elif rtype == "web_search_call":
                action = payload.get("action") or {}
                info = tool_info("openai", "web_search_call", action)
                if include_transcript:
                    transcript.append({
                        "role": "tool",
                        "kind": "tool",
                        "ts": ev.get("timestamp", ""),
                        "name": info["label"],
                        "rawName": "web_search_call",
                        "category": info["category"],
                        "provider": "openai",
                        "text": info["context"] or "web search",
                        "input": _safe_payload(compact_tool_input("web_search_call", action), max_string=12_000),
                        "toolInfo": info,
                        "status": payload.get("status") or "completed",
                    })

    session_id = meta.get("id") or path.stem.removeprefix("rollout-")
    model = max(model_counts, key=model_counts.get) if model_counts else "gpt-5.3-codex"
    cache_write = 0
    cost = compute_cost(model, tokens_in, tokens_out, cache_write, cache_read, provider="openai")

    live = False
    try:
        live = (datetime.now(tz=timezone.utc).timestamp() - path.stat().st_mtime) < 60
    except OSError:
        pass

    trace_nodes = (
        _build_trace(
            events,
            model,
            path=path,
            session_id=(session_meta_ids[0] if session_meta_ids else None),
            visited={path.resolve()},
            embed_subagents=embed_subagents,
        )
        if include_trace
        else []
    )
    if trace_nodes:
        tokens_in = trace_nodes[0].input_tokens
        tokens_out = trace_nodes[0].output_tokens
        cache_read = trace_nodes[0].cache_read
        cost = trace_nodes[0].cost
    project = Path(cwd).name if cwd else "codex"
    compressions = context_compacted_events or compacted_events

    return Session(
        id=session_id,
        short=session_id[:8],
        path=path,
        cwd=cwd or f"~/{project}",
        project=project,
        branch="HEAD",
        provider="openai",
        model=model,
        turns=max(turns, 1 if preview else 0),
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cache_write=cache_write,
        cache_read=cache_read,
        cost=cost,
        preview=preview or thread_name or meta.get("thread_name") or "(no message)",
        started_at=started_at,
        last_at=last_at,
        live=live,
        status="running" if live else "idle",
        last_action=last_action,
        duration_str=_duration_str(started_at, last_at),
        context_used=context_used,
        context_max=context_max or 258_400,
        trace_nodes=trace_nodes,
        tool_calls=tool_calls,
        transcript=transcript,
        sub_agents=sub_agents,
        skills_used=skills_used,
        mcp_tools_used=mcp_tools_used,
        memory_reads=memory_reads,
        compressions=compressions,
    )


def _build_trace(
    events: list[dict[str, Any]],
    model: str,
    *,
    path: Optional[Path] = None,
    session_id: str | None = None,
    visited: Optional[set[Path]] = None,
    initial_usage_signature: Optional[tuple[int, int, int, int, int]] = None,
    embed_subagents: bool = False,
    embed_depth: int = 1,
    capture_context: bool = True,
) -> list[TraceNode]:
    first_ts = next((_ts(e.get("timestamp")) for e in events if _ts(e.get("timestamp"))), None)
    last_ts = next((_ts(e.get("timestamp")) for e in reversed(events) if _ts(e.get("timestamp"))), None)
    total_ms = int((last_ts - first_ts).total_seconds() * 1000) if first_ts and last_ts else 1000
    total_ms = max(total_ms, 1000)
    trace_live = bool(last_ts and (datetime.now(tz=timezone.utc) - last_ts).total_seconds() < 60)

    outputs_by_call: dict[str, dict[str, Any]] = {}
    pty_final_statuses = _pty_final_statuses(events)
    for ev in events:
        payload = ev.get("payload", {}) or {}
        if ev.get("type") != "response_item":
            continue
        if payload.get("type") not in ("function_call_output", "custom_tool_call_output"):
            continue
        call_id = payload.get("call_id") or payload.get("id") or ""
        if call_id:
            outputs_by_call[call_id] = {
                "timestamp": ev.get("timestamp", ""),
                "output": payload.get("output") or payload.get("result") or "",
            }

    root = TraceNode(
        id="a1", type="assistant", name="codex.run",
        start=0, duration=total_ms, tokens=0, cost=0,
        depth=0, parent=None, status="running" if trace_live else "completed",
        live=trace_live,
        output_payload={"status": "completed"},
        attributes={
            "events": len(events),
            "session_id": session_id or (_codex_session_meta_ids(events) or [""])[0],
            "path": str(path or ""),
        },
    )
    nodes = [root]
    idx = 0
    previous_usage_signature = initial_usage_signature
    current_step: Optional[TraceNode] = None
    step_index = 0
    visited = visited or set()
    context_state = _new_codex_context_state() if capture_context else None

    def ensure_step(offset: int, label: str = "step", preview: str = "", event_index: int = 0) -> TraceNode:
        nonlocal idx, step_index, current_step
        if current_step is not None:
            if preview and not current_step.preview:
                current_step.preview = preview
            if label != "step" and "step" in current_step.name:
                current_step.name = f"{_short_model(model)} · {label}"
            return current_step
        idx += 1
        step_index += 1
        node_id = f"l{idx}"
        node = TraceNode(
            id=node_id,
            type="llm",
            name=f"{_short_model(model)} · {label if label != 'step' else f'step {step_index}'}",
            start=offset,
            duration=1000,
            tokens=0,
            cost=0,
            depth=1,
            parent="a1",
            preview=preview,
            input_payload=(
                _codex_context_snapshot(context_state, model)
                if capture_context
                else {
                    "source": "embedded_trace",
                    "capture": "omitted_for_embedded_trace",
                    "model": model,
                    "messages": [],
                    "note": "Embedded sub-agent spans keep tool inputs and outputs; full LLM context is omitted to keep detail views responsive.",
                }
            ),
            output_payload={},
            attributes={"step": step_index, "timestamp": events[event_index].get("timestamp", "") if 0 <= event_index < len(events) else ""},
        )
        nodes.append(node)
        root.children.append(node_id)
        current_step = node
        return node

    for ev_idx, ev in enumerate(events):
        ev_ts = _ts(ev.get("timestamp"))
        offset = int((ev_ts - first_ts).total_seconds() * 1000) if ev_ts and first_ts else 0
        payload = ev.get("payload", {}) or {}
        typ = ev.get("type")

        if typ == "turn_context":
            model = payload.get("model") or model
            if capture_context and context_state is not None:
                _append_codex_context_event(context_state, ev)
            continue

        if typ == "event_msg" and payload.get("type") == "agent_message":
            text = _clean(payload.get("message") or "")
            step = ensure_step(offset, "respond", text, ev_idx)
            if text:
                step.output_payload["message"] = text
            if capture_context and context_state is not None:
                _append_codex_context_event(context_state, ev)
            continue

        if typ == "event_msg" and payload.get("type") == "token_count":
            info = payload.get("info") or {}
            total_usage = info.get("total_token_usage") or {}
            last_usage = info.get("last_token_usage") or {}
            usage = last_usage or total_usage
            signature_source = total_usage or last_usage
            if not usage:
                continue
            signature = _usage_signature(signature_source)
            if signature == previous_usage_signature:
                continue
            previous_usage_signature = signature
            input_tokens, cache_read, output_tokens = _usage_tokens(usage)
            display_tokens = input_tokens + output_tokens
            if display_tokens == 0 and cache_read == 0:
                continue
            node_cost = compute_cost(model, input_tokens, output_tokens, 0, cache_read, provider="openai")
            node = ensure_step(offset, "turn", event_index=ev_idx)
            node.duration = max(node.duration, max(100, min(12_000, (display_tokens + cache_read) // 10)))
            node.tokens += display_tokens
            node.cost += node_cost
            node.input_tokens += input_tokens
            node.output_tokens += output_tokens
            node.cache_read += cache_read
            node.status = "completed"
            node.input_payload.update({
                "input_tokens": node.input_tokens,
                "cache_read_tokens": node.cache_read,
            })
            node.output_payload.update({
                "output_tokens": node.output_tokens,
                "display_tokens": node.tokens,
            })
            node.attributes["raw_usage"] = _safe_payload(usage)
            node.attributes["total_usage"] = _safe_payload(total_usage)
            root.tokens += display_tokens
            root.cost += node_cost
            root.input_tokens += input_tokens
            root.output_tokens += output_tokens
            root.cache_read += cache_read
            current_step = None
            if capture_context and context_state is not None:
                _append_codex_context_event(context_state, ev)
            continue

        if typ == "response_item" and payload.get("type") == "message":
            role = payload.get("role")
            text = _content_text(payload.get("content"))
            if role == "assistant" and text:
                step = ensure_step(offset, "respond", text, ev_idx)
                step.output_payload["message"] = text
            if capture_context and context_state is not None:
                _append_codex_context_event(context_state, ev)
            continue

        if typ == "response_item" and payload.get("type") == "reasoning":
            summary = payload.get("summary") or []
            text = _content_text(summary)
            step = ensure_step(offset, "reason", text, ev_idx)
            if text:
                step.output_payload["reasoning_summary"] = text
            if capture_context and context_state is not None:
                _append_codex_context_event(context_state, ev)
            continue

        if typ == "response_item" and payload.get("type") in ("function_call_output", "custom_tool_call_output"):
            current_step = None
            if capture_context and context_state is not None:
                _append_codex_context_event(context_state, ev)
            continue

        if typ == "response_item" and payload.get("type") in ("function_call", "custom_tool_call", "web_search_call"):
            parent = ensure_step(offset, "act", event_index=ev_idx)
            idx += 1
            action = payload.get("action")
            raw_name = payload.get("name")
            if not raw_name and isinstance(action, dict):
                raw_name = action.get("type")
            raw_name = raw_name or payload.get("type") or "tool"
            name = _clean(raw_name)
            call_id = payload.get("call_id") or payload.get("id") or f"call_{idx}"
            raw = payload.get("arguments") or payload.get("input") or payload
            parsed_input = _jsonish(raw)
            info = tool_info("openai", name, parsed_input)
            tool_call_record = {
                "name": info["label"],
                "raw_name": name,
                "category": info["category"],
                "call_id": call_id,
                "input": _safe_payload(compact_tool_input(name, parsed_input), max_string=12_000),
                "timestamp": ev.get("timestamp", ""),
            }
            parent.output_payload.setdefault("tool_calls", []).append(tool_call_record)
            if not parent.preview:
                parent.preview = info["context"] or info["label"]
            result = outputs_by_call.get(call_id, {})
            result_output = result.get("output") or ""
            result_ts = _ts(result.get("timestamp")) if result else None
            duration = 150
            output_wall_time = _output_wall_time_ms(result_output)
            if output_wall_time is not None:
                duration = output_wall_time
            elif ev_ts and result_ts:
                duration = max(150, int((result_ts - ev_ts).total_seconds() * 1000))
            status = _resolved_tool_status(
                result_output,
                parsed_input,
                pty_final_statuses,
                "completed" if result else payload.get("status") or "called",
            )
            node_id = f"t{idx}"
            node_type = "mcp" if name.startswith("mcp__") else "tool"
            if name in {"Skill", "SkillRunner"}:
                node_type = "skill"
            if name == "spawn_agent":
                node_type = "assistant"
            preview = info["context"] or _preview_from_payload(raw)
            if not preview and name != "write_stdin":
                preview = _clean(result_output)
            node = TraceNode(
                id=node_id, type=node_type, name=info["label"], start=offset, duration=duration,
                tokens=0, cost=0, depth=2, parent=parent.id,
                preview=preview,
                live=status == "running",
                status=status,
                input_payload=_safe_payload(compact_tool_input(name, parsed_input), max_string=12_000),
                output_payload={
                    "result": _safe_payload(_clean_full(result_output, max_chars=12_000), max_string=12_000),
                    "preview": _clean(result_output),
                },
                attributes={
                    "tool": info,
                    "call_id": call_id,
                    "timestamp": ev.get("timestamp", ""),
                    "result_timestamp": result.get("timestamp", ""),
                    "noise": _is_empty_poll_tool(name, parsed_input, result_output),
                },
            )
            nodes.append(node)
            parent.children.append(node_id)
            parent.duration = max(parent.duration, node.start + node.duration - parent.start)

            if name == "spawn_agent" and result:
                child_agent_id = _extract_agent_id(result.get("output") or "")
                if child_agent_id:
                    node.attributes["agent_id"] = child_agent_id
                    node.output_payload["agent_id"] = child_agent_id
                child_path = _find_codex_session_path(child_agent_id, path) if embed_subagents and embed_depth > 0 else None
                if child_path:
                    node.attributes["agent_path"] = str(child_path)
                    child_resolved = child_path.resolve()
                    if child_resolved not in visited:
                        _embed_child_trace(
                            parent=node,
                            root=root,
                            nodes=nodes,
                            child_path=child_path,
                            model=model,
                            prompt_text=str(parsed_input.get("message") or "") if isinstance(parsed_input, dict) else "",
                            visited={*visited, child_resolved},
                            embed_depth=embed_depth - 1,
                        )

        if capture_context and context_state is not None:
            _append_codex_context_event(context_state, ev)

    _mark_visual_noise_steps(nodes)
    _extend_parent_durations(nodes)
    return nodes


def _embed_child_trace(
    *,
    parent: TraceNode,
    root: TraceNode,
    nodes: list[TraceNode],
    child_path: Path,
    model: str,
    prompt_text: str,
    visited: set[Path],
    embed_depth: int,
) -> None:
    child_events = _load_codex_events(child_path)
    if not child_events:
        return
    window_events, initial_signature, window_first_ts = _child_trace_window(child_events, prompt_text)
    child_nodes = _build_trace(
        window_events,
        model,
        path=child_path,
        visited=visited,
        initial_usage_signature=initial_signature,
        embed_subagents=embed_depth > 0,
        embed_depth=embed_depth,
        capture_context=False,
    )
    if len(child_nodes) <= 1:
        return

    child_root = child_nodes[0]
    id_map = {child.id: f"{parent.id}.{child.id}" for child in child_nodes[1:]}
    embedded: list[TraceNode] = []
    parent_ts = _ts((parent.attributes or {}).get("timestamp"))
    child_offset = 0
    if parent_ts and window_first_ts:
        child_offset = max(0, int((window_first_ts - parent_ts).total_seconds() * 1000))

    for child in child_nodes[1:]:
        mapped_parent = parent.id if child.parent == child_root.id else id_map.get(child.parent or "", parent.id)
        attributes = dict(child.attributes or {})
        attributes.update({
            "embedded": True,
            "embedded_session_id": child_root.attributes.get("session_id", ""),
            "embedded_path": str(child_path),
        })
        embedded.append(TraceNode(
            id=id_map[child.id],
            type=child.type,
            name=child.name,
            start=parent.start + child_offset + child.start,
            duration=child.duration,
            tokens=child.tokens,
            cost=child.cost,
            depth=parent.depth + child.depth,
            parent=mapped_parent,
            live=child.live,
            preview=child.preview,
            input_tokens=child.input_tokens,
            output_tokens=child.output_tokens,
            cache_write=child.cache_write,
            cache_read=child.cache_read,
            status=child.status,
            children=[id_map[c] for c in child.children if c in id_map],
            input_payload=dict(child.input_payload or {}),
            output_payload=dict(child.output_payload or {}),
            attributes=attributes,
        ))

    nodes.extend(embedded)
    parent.children.extend(id_map[child.id] for child in child_nodes[1:] if child.parent == child_root.id)
    child_end = max(child.start + child.duration for child in embedded)
    parent.duration = max(parent.duration, child_end - parent.start)

    parent.tokens += child_root.tokens
    parent.cost += child_root.cost
    parent.input_tokens += child_root.input_tokens
    parent.output_tokens += child_root.output_tokens
    parent.cache_write += child_root.cache_write
    parent.cache_read += child_root.cache_read
    parent.output_payload.update({
        "embedded_trace_nodes": len(embedded),
        "embedded_tokens": child_root.tokens,
        "embedded_cost": round(child_root.cost, 6),
    })
    active_statuses = {"called", "in_progress", "pending", "running"}
    if child_root.live or any(child.live or str(child.status).lower() in active_statuses for child in embedded):
        parent.live = True
        parent.status = "running"

    root.tokens += child_root.tokens
    root.cost += child_root.cost
    root.input_tokens += child_root.input_tokens
    root.output_tokens += child_root.output_tokens
    root.cache_write += child_root.cache_write
    root.cache_read += child_root.cache_read
