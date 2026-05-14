from __future__ import annotations

import json
from typing import Any


def jsonish(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def text_preview(value: Any, limit: int = 220) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    elif isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False)
    else:
        text = str(value)
    text = " ".join(text.strip().split())
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def tool_info(provider: str, raw_name: str, tool_input: Any = None) -> dict[str, Any]:
    name = str(raw_name or "tool")
    parsed = jsonish(tool_input)
    lowered = name.lower()

    if name.startswith("mcp__"):
        parts = name.split("__", 2)
        server = parts[1] if len(parts) > 1 else "mcp"
        mcp_tool = parts[2] if len(parts) > 2 else "tool"
        category = "browser" if "chrome" in server or "playwright" in server else "mcp"
        return {
            "rawName": name,
            "label": f"{server}.{mcp_tool}",
            "category": category,
            "provider": provider,
            "context": tool_context(name, parsed),
        }

    aliases: dict[str, tuple[str, str]] = {
        # Claude Code built-ins.
        "Bash": ("shell", "shell command"),
        "Read": ("read_file", "read file"),
        "Write": ("write_file", "write file"),
        "Edit": ("edit_file", "edit file"),
        "MultiEdit": ("edit_file", "edit file"),
        "Glob": ("search", "glob"),
        "Grep": ("search", "grep"),
        "LS": ("list_dir", "list directory"),
        "WebFetch": ("web_fetch", "web fetch"),
        "WebSearch": ("web_search", "web search"),
        "Task": ("agent", "sub-agent"),
        "Agent": ("agent", "agent"),
        "TodoWrite": ("todo", "todo"),
        "NotebookRead": ("read_file", "read notebook"),
        "NotebookEdit": ("edit_file", "edit notebook"),
        "Skill": ("skill", "skill"),
        "SkillRunner": ("skill", "skill"),
        # Codex response item names.
        "exec_command": ("shell", "shell command"),
        "write_stdin": ("shell", "shell input"),
        "apply_patch": ("edit_file", "patch"),
        "view_image": ("read_file", "view image"),
        "read_mcp_resource": ("mcp_resource", "read mcp resource"),
        "list_mcp_resources": ("mcp_resource", "list mcp resources"),
        "list_mcp_resource_templates": ("mcp_resource", "list mcp templates"),
        "spawn_agent": ("agent", "sub-agent"),
        "send_input": ("agent", "agent input"),
        "wait_agent": ("agent", "wait agent"),
        "close_agent": ("agent", "close agent"),
        "web_search_call": ("web_search", "web search"),
    }
    category, label = aliases.get(name, ("tool", name))
    if lowered.startswith("web_"):
        category, label = "web", name.replace("_", " ")

    return {
        "rawName": name,
        "label": label,
        "category": category,
        "provider": provider,
        "context": tool_context(name, parsed),
    }


def tool_context(raw_name: str, parsed_input: Any) -> str:
    value = jsonish(parsed_input)
    if isinstance(value, dict):
        if raw_name == "write_stdin":
            chars = value.get("chars")
            return text_preview(chars, 180) if chars not in (None, "") else ""
        for key in (
            "cmd",
            "command",
            "file_path",
            "path",
            "source_file",
            "document_url",
            "spreadsheet_url",
            "presentation_url",
            "query",
            "pattern",
            "url",
            "message",
            "description",
            "text",
        ):
            if key in value and value.get(key) not in (None, ""):
                return text_preview(value.get(key), 180)
        if raw_name == "apply_patch" and "input" in value:
            return text_preview(value.get("input"), 180)
        if value:
            key, val = next(iter(value.items()))
            return f"{key}: {text_preview(val, 160)}"
    return text_preview(value, 180)


def compact_tool_input(raw_name: str, parsed_input: Any) -> dict[str, Any]:
    value = jsonish(parsed_input)
    if not isinstance(value, dict):
        return {"value": text_preview(value, 400)}

    if raw_name == "write_stdin":
        out: dict[str, Any] = {}
        chars = value.get("chars")
        if chars not in (None, ""):
            out["chars"] = chars
        for key in ("yield_time_ms", "max_output_tokens"):
            if key in value and value.get(key) not in (None, ""):
                out[key] = value.get(key)
        return out

    out: dict[str, Any] = {}
    for key in (
        "cmd",
        "command",
        "workdir",
        "file_path",
        "path",
        "source_file",
        "document_url",
        "spreadsheet_url",
        "presentation_url",
        "query",
        "pattern",
        "url",
        "message",
        "description",
        "text",
        "target",
        "uid",
    ):
        if key in value and value.get(key) not in (None, ""):
            out[key] = value.get(key)

    for key in ("content", "old_string", "new_string", "input"):
        if key in value and value.get(key) not in (None, ""):
            raw = value.get(key)
            raw_text = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
            out[f"{key}_preview"] = text_preview(raw_text, 600)
            out[f"{key}_chars"] = len(raw_text)

    if not out:
        for idx, (key, val) in enumerate(value.items()):
            if idx >= 6:
                out["more_keys"] = len(value) - idx
                break
            out[key] = val
    return out


def command_from_input(value: Any) -> str:
    parsed = jsonish(value)
    if isinstance(parsed, dict):
        for key in ("cmd", "command"):
            if parsed.get(key):
                return str(parsed[key])
        if "input" in parsed and isinstance(parsed["input"], str):
            return parsed["input"]
    if isinstance(parsed, str):
        return parsed
    return ""
