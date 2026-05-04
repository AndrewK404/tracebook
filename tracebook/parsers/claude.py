"""Parse a Claude Code JSONL transcript into a typed Session.

The on-disk format is one JSON object per line. Each object has a `type`
discriminator (`user`, `assistant`, `system`, `attachment`,
`permission-mode`, `file-history-snapshot`, ...).  We project that stream
onto a clean conversational model: a list of `Turn`s, where each turn is
either a user prompt, an assistant response (text + tool calls + thinking),
a tool result, or a system event we want to surface.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from tracebook.settings import ModelPricing, price_for


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class Usage:
    input: int = 0
    output: int = 0
    cache_read: int = 0
    cache_write: int = 0

    @property
    def total(self) -> int:
        return self.input + self.output + self.cache_read + self.cache_write


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]

    def summary(self) -> str:
        """One-line summary suitable for a cell or compact card."""
        if not self.input:
            return self.name
        if self.name == "Bash":
            cmd = str(self.input.get("command", "")).strip().splitlines()[0]
            return cmd[:200]
        if self.name in {"Read", "Write", "Edit", "NotebookEdit"}:
            return str(self.input.get("file_path", ""))
        if self.name == "Grep":
            pattern = self.input.get("pattern", "")
            path = self.input.get("path", "")
            return f"{pattern}  {path}".strip()
        if self.name == "Glob":
            return str(self.input.get("pattern", ""))
        if self.name == "WebFetch":
            return str(self.input.get("url", ""))
        # Generic fallback — first scalar value.
        for val in self.input.values():
            if isinstance(val, (str, int, float)):
                return str(val)[:200]
        return ""


@dataclass
class ToolResult:
    tool_use_id: str
    content: str
    is_error: bool = False

    @property
    def line_count(self) -> int:
        return self.content.count("\n") + 1 if self.content else 0

    @property
    def byte_count(self) -> int:
        return len(self.content.encode("utf-8")) if self.content else 0


@dataclass
class Turn:
    index: int
    kind: str  # "user" | "assistant" | "tool_result" | "system"
    timestamp: datetime | None = None
    text: str | None = None
    thinking: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)
    usage: Usage | None = None
    cost_usd: float = 0.0
    model: str | None = None


@dataclass
class Session:
    id: str
    cwd: str
    project_name: str
    source_path: Path
    size_bytes: int = 0
    turns: list[Turn] = field(default_factory=list)
    started_at: datetime | None = None
    last_activity_at: datetime | None = None
    is_live: bool = False
    model: str | None = None
    git_branch: str | None = None
    total_cost_usd: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cache_read_tokens: int = 0
    total_cache_write_tokens: int = 0
    tool_counts: dict[str, int] = field(default_factory=dict)
    first_user_prompt: str | None = None

    @property
    def short_id(self) -> str:
        # First chunk of a UUID — e.g. "01HXKQ3F" — for compact display.
        return self.id.split("-", 1)[0][:8].upper()

    @property
    def turn_count(self) -> int:
        return len(self.turns)


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


def _parse_timestamp(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        # JSONL writes RFC3339 with trailing "Z".
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _decode_cwd_from_dirname(dirname: str) -> str:
    """Project subdirs encode cwd by replacing path separators with `-`.

    E.g. "-Users-andrewkuncevich-vs-code-projects-ai-business"
         → "/Users/andrewkuncevich/vs-code-projects/ai-business".

    The encoding is lossy (you can't tell `-` in a real folder name from a
    separator), but it matches what Claude Code itself produces.
    """
    if dirname.startswith("-"):
        return "/" + dirname[1:].replace("-", "/")
    return dirname.replace("-", "/")


def _coerce_str_content(content: Any) -> str:
    """tool_result content can be a string, a list of blocks, or null."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks: list[str] = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    chunks.append(str(block.get("text", "")))
                elif block.get("type") == "image":
                    chunks.append("[image]")
                else:
                    chunks.append(str(block))
            else:
                chunks.append(str(block))
        return "\n".join(chunks)
    return str(content)


def _extract_user_text(content: Any) -> str | None:
    """Pull the first text block out of a user-message content payload."""
    if isinstance(content, str):
        return content.strip() or None
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                txt = str(block.get("text", "")).strip()
                if txt:
                    return txt
    return None


# System-injected wrappers that show up at the top of user messages but are
# not actually what the user typed. We strip them so the preview is useful.
_SYSTEM_WRAPPER_TAGS = (
    "<local-command-caveat>",
    "<command-name>",
    "<command-message>",
    "<command-args>",
    "<local-command-stdout>",
    "<system-reminder>",
    "<bash-input>",
    "<bash-stdout>",
    "<bash-stderr>",
)


def _clean_user_prompt(text: str | None) -> str | None:
    """Strip leading system-injected XML wrappers to recover the real prose."""
    if not text:
        return text
    s = text.strip()
    # Drop any number of leading <tag>…</tag> blocks.
    for _ in range(8):
        if not s.startswith("<"):
            break
        matched = False
        for tag in _SYSTEM_WRAPPER_TAGS:
            if s.startswith(tag):
                close = "</" + tag[1:]
                end = s.find(close)
                if end == -1:
                    return None
                s = s[end + len(close):].lstrip()
                matched = True
                break
        if not matched:
            break
    return s or None


def _compute_cost(usage: Usage, pricing: ModelPricing) -> float:
    return (
        (usage.input * pricing.input_per_mtok)
        + (usage.output * pricing.output_per_mtok)
        + (usage.cache_read * pricing.cache_read_per_mtok)
        + (usage.cache_write * pricing.cache_write_per_mtok)
    ) / 1_000_000


def _iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                yield obj


def parse_session(
    path: Path,
    pricing: dict[str, ModelPricing],
    *,
    live_threshold_seconds: int = 60,
) -> Session:
    """Parse a single Claude Code transcript into a Session."""
    session_id = path.stem
    parent = path.parent.name
    cwd = _decode_cwd_from_dirname(parent)
    project_name = cwd.rsplit("/", 1)[-1] or cwd

    stat = path.stat()
    session = Session(
        id=session_id,
        cwd=cwd,
        project_name=project_name,
        source_path=path,
        size_bytes=stat.st_size,
    )

    seen_message_ids: set[str] = set()
    last_event_ts: datetime | None = None

    for obj in _iter_jsonl(path):
        kind = obj.get("type")
        ts = _parse_timestamp(obj.get("timestamp"))

        if ts and (last_event_ts is None or ts > last_event_ts):
            last_event_ts = ts
        if ts and session.started_at is None:
            session.started_at = ts

        # Surface cwd / git metadata if the event carries it.
        evt_cwd = obj.get("cwd")
        if isinstance(evt_cwd, str) and evt_cwd:
            session.cwd = evt_cwd
            session.project_name = evt_cwd.rsplit("/", 1)[-1] or evt_cwd
        gb = obj.get("gitBranch")
        if isinstance(gb, str) and gb:
            session.git_branch = gb

        if kind == "user":
            message = obj.get("message") or {}
            content = message.get("content") if isinstance(message, dict) else None
            # Two flavors: real user prompt OR a synthetic "user" with tool_result blocks.
            tool_results = _extract_tool_results(content)
            if tool_results:
                turn = Turn(
                    index=len(session.turns),
                    kind="tool_result",
                    timestamp=ts,
                    tool_results=tool_results,
                )
                session.turns.append(turn)
            else:
                text = _extract_user_text(content)
                if text or content is not None:
                    turn = Turn(
                        index=len(session.turns),
                        kind="user",
                        timestamp=ts,
                        text=text,
                    )
                    if session.first_user_prompt is None:
                        cleaned = _clean_user_prompt(text)
                        if cleaned:
                            session.first_user_prompt = cleaned
                    session.turns.append(turn)

        elif kind == "assistant":
            message = obj.get("message") or {}
            if not isinstance(message, dict):
                continue
            msg_id = str(message.get("id", ""))
            usage = _extract_usage(message.get("usage"))
            model = message.get("model") or session.model
            if isinstance(model, str):
                session.model = model

            text_chunks: list[str] = []
            thinking_chunks: list[str] = []
            tool_calls: list[ToolCall] = []
            for block in message.get("content") or []:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "text":
                    text_chunks.append(str(block.get("text", "")))
                elif btype == "thinking":
                    thinking_chunks.append(str(block.get("thinking", "")))
                elif btype == "tool_use":
                    name = str(block.get("name", "?"))
                    tool_calls.append(
                        ToolCall(
                            id=str(block.get("id", "")),
                            name=name,
                            input=block.get("input") or {},
                        )
                    )
                    session.tool_counts[name] = session.tool_counts.get(name, 0) + 1

            cost = 0.0
            if usage and msg_id and msg_id not in seen_message_ids:
                seen_message_ids.add(msg_id)
                cost = _compute_cost(usage, price_for(model, pricing))
                session.total_cost_usd += cost
                session.total_input_tokens += usage.input
                session.total_output_tokens += usage.output
                session.total_cache_read_tokens += usage.cache_read
                session.total_cache_write_tokens += usage.cache_write

            turn = Turn(
                index=len(session.turns),
                kind="assistant",
                timestamp=ts,
                text="\n\n".join(c for c in text_chunks if c) or None,
                thinking="\n\n".join(c for c in thinking_chunks if c) or None,
                tool_calls=tool_calls,
                usage=usage,
                cost_usd=cost,
                model=model if isinstance(model, str) else None,
            )
            session.turns.append(turn)

        elif kind == "system":
            content = obj.get("content")
            if isinstance(content, str) and content.strip():
                turn = Turn(
                    index=len(session.turns),
                    kind="system",
                    timestamp=ts,
                    text=content.strip(),
                )
                session.turns.append(turn)

        # All other event types (permission-mode, file-history-snapshot,
        # last-prompt, queue-operation, attachment) are intentionally
        # ignored — they're housekeeping, not transcript.

    session.last_activity_at = last_event_ts or datetime.fromtimestamp(stat.st_mtime, timezone.utc)
    if session.started_at is None:
        session.started_at = session.last_activity_at

    now = datetime.now(timezone.utc)
    if session.last_activity_at and (now - session.last_activity_at).total_seconds() <= live_threshold_seconds:
        session.is_live = True

    return session


def _extract_usage(raw: Any) -> Usage | None:
    if not isinstance(raw, dict):
        return None
    return Usage(
        input=int(raw.get("input_tokens") or 0),
        output=int(raw.get("output_tokens") or 0),
        cache_read=int(raw.get("cache_read_input_tokens") or 0),
        cache_write=int(raw.get("cache_creation_input_tokens") or 0),
    )


def _extract_tool_results(content: Any) -> list[ToolResult]:
    if not isinstance(content, list):
        return []
    out: list[ToolResult] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "tool_result":
            out.append(
                ToolResult(
                    tool_use_id=str(block.get("tool_use_id", "")),
                    content=_coerce_str_content(block.get("content")),
                    is_error=bool(block.get("is_error", False)),
                )
            )
    return out
