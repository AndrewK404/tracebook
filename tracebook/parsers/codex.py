"""
Parse Codex archived rollout JSONL into the shared Session shape.

Codex transcripts are append-only JSONL files under ~/.codex/archived_sessions.
Token usage appears in event_msg/token_count events and is cumulative.
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


def parse_session(path: Path) -> Optional[Session]:
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
        return None

    if not events:
        return None

    meta: dict[str, Any] = {}
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
    total_usage: dict[str, Any] = {}
    previous_total_usage: dict[str, Any] = {}
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
            transcript.append({
                "role": "system",
                "kind": "compression",
                "text": "conversation compressed",
                "ts": ev.get("timestamp", ""),
                "items": len(replacement) if isinstance(replacement, list) else 0,
            })
            continue

        if typ == "session_meta":
            meta = payload
            cwd = payload.get("cwd") or cwd
            # Codex session_meta.timestamp is the session allocation time and can
            # predate the first transcript event. Keep started_at on the JSONL
            # event timeline so user markers and trace nodes share one origin.
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
                text = _clean_full(payload.get("message") or "")
                if text and not _is_meta_text(text):
                    preview = preview or _clean(text)
                    if _append_transcript(transcript, "user", text, ev.get("timestamp", ""), kind="message"):
                        turns += 1
            elif ptype == "agent_message":
                text = _clean_full(payload.get("message") or "")
                if text:
                    _append_transcript(transcript, "assistant", text, ev.get("timestamp", ""), kind="message")
                    for skill in _extract_skill_names(text):
                        _bump_named(skills_used, skill, source="message")
            elif ptype == "token_count":
                info = payload.get("info") or {}
                usage = info.get("total_token_usage") or {}
                if usage:
                    delta_input = max(
                        0,
                        int(usage.get("input_tokens") or 0)
                        - int(previous_total_usage.get("input_tokens") or 0),
                    )
                    total_usage = usage
                    previous_total_usage = usage
                    context_used = max(context_used, delta_input)
                context_max = max(context_max, int(info.get("model_context_window") or 0))
            elif ptype == "thread_name_updated":
                thread_name = payload.get("thread_name") or thread_name
            elif ptype == "context_compacted":
                context_compacted_events += 1
                if not transcript or transcript[-1].get("kind") != "compression":
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
                raw_text = _raw_content_text(content)
                text = _content_text_full(content)
                if role == "user" and text and not _is_meta_text(text):
                    preview = preview or _clean(text)
                    if _append_transcript(transcript, role, text, ev.get("timestamp", ""), kind="message"):
                        turns += 1
                if role in ("user", "assistant") and text and not (role == "user" and _is_meta_text(text)):
                    _append_transcript(transcript, role, text, ev.get("timestamp", ""), kind="message")
                    if role == "assistant":
                        for skill in _extract_skill_names(text):
                            _bump_named(skills_used, skill, source="message")
                elif role in ("developer", "system") and raw_text:
                    for skill in _extract_skill_names(raw_text):
                        _bump_named(skills_used, skill, source="context")
            elif rtype in ("function_call", "custom_tool_call"):
                name = _clean(payload.get("name") or "tool")
                call_id = payload.get("call_id") or payload.get("id") or f"call_{len(tool_calls)}"
                raw_input = payload.get("arguments") or payload.get("input") or ""
                parsed_input = _jsonish(raw_input)
                tool = ToolCall(name=name, input_preview=_preview_from_payload(raw_input))
                calls_by_id[call_id] = tool
                tool_calls.append(tool)
                last_action = name
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
                    "text": info["context"] or tool.input_preview or name,
                    "input": _safe_payload(compact_input, max_string=12_000),
                    "toolInfo": info,
                    "status": "pending",
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
                tool = calls_by_id.get(call_id)
                output_text = _clean_full(payload.get("output") or payload.get("result") or "", max_chars=12_000)
                if tool:
                    tool.output_preview = _clean(output_text)
                if call_id in transcript_tools:
                    transcript_tools[call_id].update({
                        "status": "completed",
                        "output": _safe_payload(output_text, max_string=12_000),
                        "outputPreview": _clean(output_text),
                    })
            elif rtype == "web_search_call":
                action = payload.get("action") or {}
                info = tool_info("openai", "web_search_call", action)
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
    tokens_in, cache_read, tokens_out = _usage_tokens(total_usage)
    cache_write = 0
    cost = compute_cost(model, tokens_in, tokens_out, cache_write, cache_read, provider="openai")

    live = False
    try:
        live = (datetime.now(tz=timezone.utc).timestamp() - path.stat().st_mtime) < 60
    except OSError:
        pass

    trace_nodes = _build_trace(events, model)
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


def _build_trace(events: list[dict[str, Any]], model: str) -> list[TraceNode]:
    first_ts = next((_ts(e.get("timestamp")) for e in events if _ts(e.get("timestamp"))), None)
    last_ts = next((_ts(e.get("timestamp")) for e in reversed(events) if _ts(e.get("timestamp"))), None)
    total_ms = int((last_ts - first_ts).total_seconds() * 1000) if first_ts and last_ts else 1000
    total_ms = max(total_ms, 1000)

    outputs_by_call: dict[str, dict[str, Any]] = {}
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
        depth=0, parent=None, status="completed",
        output_payload={"status": "completed"},
        attributes={"events": len(events)},
    )
    nodes = [root]
    idx = 0
    previous_usage = {"input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0}
    current_step: Optional[TraceNode] = None
    step_index = 0

    def ensure_step(offset: int, label: str = "step", preview: str = "") -> TraceNode:
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
            input_payload={"model": model},
            output_payload={},
            attributes={"step": step_index},
        )
        nodes.append(node)
        root.children.append(node_id)
        current_step = node
        return node

    for ev in events:
        ev_ts = _ts(ev.get("timestamp"))
        offset = int((ev_ts - first_ts).total_seconds() * 1000) if ev_ts and first_ts else 0
        payload = ev.get("payload", {}) or {}
        typ = ev.get("type")

        if typ == "turn_context":
            model = payload.get("model") or model
            continue

        if typ == "event_msg" and payload.get("type") == "agent_message":
            text = _clean(payload.get("message") or "")
            step = ensure_step(offset, "respond", text)
            if text:
                step.output_payload["message"] = text
            continue

        if typ == "event_msg" and payload.get("type") == "token_count":
            usage = ((payload.get("info") or {}).get("total_token_usage") or {})
            if not usage:
                continue
            delta_usage = {
                "input_tokens": max(0, int(usage.get("input_tokens") or 0) - int(previous_usage.get("input_tokens") or 0)),
                "cached_input_tokens": max(0, int(usage.get("cached_input_tokens") or 0) - int(previous_usage.get("cached_input_tokens") or 0)),
                "output_tokens": max(0, int(usage.get("output_tokens") or 0) - int(previous_usage.get("output_tokens") or 0)),
            }
            previous_usage = usage
            input_tokens, cache_read, output_tokens = _usage_tokens(delta_usage)
            display_tokens = input_tokens + output_tokens
            if display_tokens == 0 and cache_read == 0:
                continue
            node_cost = compute_cost(model, input_tokens, output_tokens, 0, cache_read, provider="openai")
            node = ensure_step(offset, "turn")
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
            root.tokens += display_tokens
            root.cost += node_cost
            root.input_tokens += input_tokens
            root.output_tokens += output_tokens
            root.cache_read += cache_read
            current_step = None
            continue

        if typ == "response_item" and payload.get("type") == "message":
            role = payload.get("role")
            text = _content_text(payload.get("content"))
            if role == "assistant" and text:
                step = ensure_step(offset, "respond", text)
                step.output_payload["message"] = text
            continue

        if typ == "response_item" and payload.get("type") == "reasoning":
            summary = payload.get("summary") or []
            text = _content_text(summary)
            step = ensure_step(offset, "reason", text)
            if text:
                step.output_payload["reasoning_summary"] = text
            continue

        if typ == "response_item" and payload.get("type") in ("function_call", "custom_tool_call", "web_search_call"):
            parent = ensure_step(offset, "act")
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
            result = outputs_by_call.get(call_id, {})
            result_ts = _ts(result.get("timestamp")) if result else None
            duration = 150
            if ev_ts and result_ts:
                duration = max(150, int((result_ts - ev_ts).total_seconds() * 1000))
            node_id = f"t{idx}"
            node_type = "mcp" if name.startswith("mcp__") else "tool"
            if name in {"Skill", "SkillRunner"}:
                node_type = "skill"
            if name == "spawn_agent":
                node_type = "assistant"
            preview = info["context"] or _preview_from_payload(raw)
            if not preview and name != "write_stdin":
                preview = _clean(result.get("output") or "")
            node = TraceNode(
                id=node_id, type=node_type, name=info["label"], start=offset, duration=duration,
                tokens=0, cost=0, depth=2, parent=parent.id,
                preview=preview,
                status="completed" if result else payload.get("status") or "called",
                input_payload=_safe_payload(compact_tool_input(name, parsed_input), max_string=12_000),
                output_payload={
                    "result": _safe_payload(_clean_full(result.get("output") or "", max_chars=12_000), max_string=12_000),
                    "preview": _clean(result.get("output") or ""),
                },
                attributes={
                    "tool": info,
                    "call_id": call_id,
                    "timestamp": ev.get("timestamp", ""),
                    "result_timestamp": result.get("timestamp", ""),
                },
            )
            nodes.append(node)
            parent.children.append(node_id)
            parent.duration = max(parent.duration, node.start + node.duration - parent.start)

    _extend_parent_durations(nodes)
    return nodes
