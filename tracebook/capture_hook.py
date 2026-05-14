from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tracebook.settings import settings


KEEP_INPUT_KEYS = {
    "cmd",
    "command",
    "description",
    "file_path",
    "path",
    "pattern",
    "query",
    "url",
    "workdir",
}


def _clip(value: Any, limit: int = 2000) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value if len(value) <= limit else value[:limit] + f"... [truncated {len(value) - limit} chars]"
    if isinstance(value, list):
        return [_clip(v, limit=limit) for v in value[:12]]
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, val in value.items():
            key_s = str(key)
            lowered = key_s.lower()
            if lowered in {"content", "image", "image_url", "base64", "encrypted_content"}:
                text = val if isinstance(val, str) else json.dumps(val, ensure_ascii=False)
                out[f"{key_s}_chars"] = len(text)
                out[f"{key_s}_preview"] = _clip(text, 400)
            elif key_s in KEEP_INPUT_KEYS or lowered in KEEP_INPUT_KEYS:
                out[key_s] = _clip(val, limit=limit)
        if not out:
            for idx, (key, val) in enumerate(value.items()):
                if idx >= 8:
                    out["more_keys"] = len(value) - idx
                    break
                out[str(key)] = _clip(val, limit=400)
        return out
    return _clip(str(value), limit=limit)


def _provider(transcript_path: str) -> str:
    lowered = transcript_path.lower()
    if "/.codex/" in lowered:
        return "openai"
    if "/.claude/" in lowered:
        return "anthropic"
    return "unknown"


def _record(raw: dict[str, Any]) -> dict[str, Any]:
    transcript_path = str(raw.get("transcript_path") or "")
    record = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "provider": _provider(transcript_path),
        "session_id": raw.get("session_id"),
        "turn_id": raw.get("turn_id"),
        "cwd": raw.get("cwd"),
        "transcript_path": transcript_path,
        "event": raw.get("hook_event_name") or raw.get("event") or raw.get("type"),
        "tool_name": raw.get("tool_name"),
        "tool_use_id": raw.get("tool_use_id"),
    }
    if "source" in raw:
        record["source"] = raw.get("source")
    if "prompt" in raw:
        record["prompt_preview"] = _clip(raw.get("prompt"), 2000)
    if "tool_input" in raw:
        record["tool_input"] = _clip(raw.get("tool_input"))
    if "tool_response" in raw:
        record["tool_response"] = _clip(raw.get("tool_response"))
    if "tool_calls" in raw:
        record["tool_calls"] = _clip(raw.get("tool_calls"))
    return {k: v for k, v in record.items() if v not in (None, "", [], {})}


def main() -> None:
    try:
        raw_text = sys.stdin.read()
        if not raw_text.strip():
            return
        raw = json.loads(raw_text)
        if not isinstance(raw, dict):
            return
        settings.tracebook_home.mkdir(parents=True, exist_ok=True)
        path = settings.tracebook_home / "hooks.jsonl"
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(_record(raw), ensure_ascii=False, separators=(",", ":")) + "\n")
    except Exception:
        # Hooks should never break the calling agent.
        return


if __name__ == "__main__":
    main()
