from __future__ import annotations

import json
import os
import re
import sys
import tomllib
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader

from tracebook import __version__
from tracebook.parsers.claude import Session, TraceNode, parse_session as parse_claude_session
from tracebook.parsers.codex import parse_session as parse_codex_session
from tracebook.pricing import PRICING
from tracebook.settings import settings
from tracebook.store import store

app = FastAPI(title="tracebook", version=__version__)
APP_STARTED_AT = datetime.now(tz=timezone.utc)
_SESSION_DETAIL_CACHE: dict[str, tuple[int, Session]] = {}
_SESSION_DETAIL_CACHE_LOCK = threading.RLock()


@app.middleware("http")
async def no_cache_local_assets(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response


# Static files
app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")

# Jinja2
_jinja = Environment(loader=FileSystemLoader(str(settings.templates_dir)), autoescape=True)


def _asset_version() -> str:
    latest = 0
    for root in (settings.static_dir, settings.templates_dir):
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix not in {".css", ".html", ".js", ".jsx"}:
                continue
            try:
                latest = max(latest, path.stat().st_mtime_ns)
            except OSError:
                continue
    return str(latest or int(APP_STARTED_AT.timestamp() * 1000))


class TracePathUpdate(BaseModel):
    claude_projects: str | None = None
    codex_sessions: str | None = None
    codex_archive_sessions: str | None = None


def _format_uptime(delta: timedelta) -> str:
    seconds = max(0, int(delta.total_seconds()))
    days, seconds = divmod(seconds, 86400)
    hours, seconds = divmod(seconds, 3600)
    minutes = seconds // 60
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


# ─── HTML shell ───────────────────────────────────────────────────────────────

APP_ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<defs>
<linearGradient id="tracebook-logo-bg" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
<stop stop-color="#0f172a"/>
<stop offset="0.55" stop-color="#10251f"/>
<stop offset="1" stop-color="#063f33"/>
</linearGradient>
</defs>
<rect x="2" y="2" width="20" height="20" rx="6" fill="url(#tracebook-logo-bg)"/>
<path d="M6.7 16.8C9.2 13.4 14.2 15.6 17.4 10.8" stroke="#34d399" stroke-width="1.5" stroke-linecap="round" fill="none"/>
<circle cx="6.7" cy="16.8" r="1.35" fill="#34d399"/>
<circle cx="17.4" cy="10.8" r="1.35" fill="#67e8f9"/>
<path d="M7.2 7.2H16.8M12 7.2V17" stroke="#ecfdf5" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="#34d399" stroke-opacity="0.28" fill="none"/>
</svg>"""

@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    tmpl = _jinja.get_template("index.html")
    return HTMLResponse(tmpl.render(version=__version__, asset_version=_asset_version()))


@app.get("/favicon.ico")
async def favicon() -> Response:
    return Response(APP_ICON_SVG, media_type="image/svg+xml")


@app.get("/favicon.svg")
async def favicon_svg() -> Response:
    return Response(APP_ICON_SVG, media_type="image/svg+xml")


# ─── JSON API ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "sessions": len(store.sessions), "version": __version__, "assetVersion": _asset_version()}


@app.get("/api/sessions")
async def api_sessions() -> JSONResponse:
    store.refresh()
    sessions = store.list_sessions()
    return JSONResponse([_session_summary(s) for s in sessions])


def _load_detailed_session(sess: Session) -> Session:
    cache_key = str(sess.path)
    try:
        mtime = sess.path.stat().st_mtime_ns
    except OSError:
        return sess

    with _SESSION_DETAIL_CACHE_LOCK:
        cached = _SESSION_DETAIL_CACHE.get(cache_key)
        if cached and cached[0] == mtime and cached[1].id == sess.id:
            return cached[1]

    if sess.provider == "openai":
        detailed = parse_codex_session(
            sess.path,
            include_trace=True,
            include_transcript=True,
            embed_subagents=True,
        )
    else:
        detailed = parse_claude_session(
            sess.path,
            include_trace=True,
            include_transcript=True,
        )

    if detailed is None:
        detailed = sess
    elif detailed.id != sess.id:
        # Keep summary identity if the source path changed under the hood.
        detailed = sess

    with _SESSION_DETAIL_CACHE_LOCK:
        if detailed is not sess:
            _SESSION_DETAIL_CACHE[cache_key] = (mtime, detailed)

    return detailed


@app.get("/api/sessions/{session_id}")
async def api_session_detail(session_id: str) -> JSONResponse:
    store.refresh()
    sess = store.get_session(session_id)
    if not sess:
        raise HTTPException(404, f"session {session_id!r} not found")
    return JSONResponse(_session_detail(_load_detailed_session(sess)))


@app.get("/api/dashboard")
async def api_dashboard(
    period: str = "14",
    provider: str = "all",
    model: str = "all",
) -> JSONResponse:
    store.refresh()
    all_sessions = store.list_sessions()

    now = datetime.now(tz=timezone.utc)
    filtered = _filter_sessions(all_sessions, period=period, provider=provider, model=model, now=now)

    # Previous period for delta, using the same provider/model filters.
    if period != "all":
        try:
            days = int(period)
            prev_cutoff = now - timedelta(days=days * 2)
            prev_end = now - timedelta(days=days)
            prev_filtered = _filter_sessions(
                all_sessions,
                period="all",
                provider=provider,
                model=model,
                now=now,
                start_at=prev_cutoff,
                end_at=prev_end,
            )
        except ValueError:
            prev_filtered = []
    else:
        prev_filtered = []

    def totals(sessions: list[Session]) -> dict:
        return {
            "tokens": sum(_dashboard_tokens(s) for s in sessions),
            "cost": sum(s.cost for s in sessions),
            "sessions": len(sessions),
        }

    cur = totals(filtered)
    prev = totals(prev_filtered)

    def pct_delta(a: float, b: float) -> Optional[float]:
        if b == 0:
            return None
        return round((a - b) / b * 100, 1)

    # KPI sparklines — 12 data points over the period
    spark_tokens, spark_cost, spark_sessions = _build_sparklines(filtered, period)

    # Daily chart data
    chart_series = _chart_series(filtered, provider)
    chart = _build_chart(filtered, period, chart_series)

    # Project breakdown
    project_pie = _build_project_pie(filtered)

    # Cache stats
    cache_read_total = sum(s.cache_read for s in filtered)
    cache_write_total = sum(s.cache_write for s in filtered)
    input_side_total = sum(s.tokens_in + s.cache_write + s.cache_read for s in filtered)
    cache_ratio = cache_read_total / input_side_total if input_side_total else 0
    cache_sparkline = _build_cache_sparkline(filtered, period)

    avg_cost = cur["cost"] / max(cur["sessions"], 1)
    prev_avg_cost = prev.get("cost", 0) / max(prev.get("sessions", 1), 1) if prev["sessions"] > 0 else 0

    return JSONResponse({
        "kpis": {
            "tokens": {"value": cur["tokens"], "delta": pct_delta(cur["tokens"], prev["tokens"])},
            "sessions": {"value": cur["sessions"], "delta": pct_delta(cur["sessions"], prev["sessions"])},
            "cost": {"value": cur["cost"], "delta": pct_delta(cur["cost"], prev["cost"])},
            "avg_cost": {"value": avg_cost, "delta": pct_delta(avg_cost, prev_avg_cost)},
        },
        "sparklines": {
            "tokens": spark_tokens,
            "cost": spark_cost,
            "sessions": spark_sessions,
        },
        "chart": chart,
        "chart_series": chart_series,
        "project_pie": project_pie,
        "cache": {
            "read_ratio": round(cache_ratio, 4),
            "read_tokens": cache_read_total,
            "write_tokens": cache_write_total,
            "uncached_tokens": sum(s.tokens_in for s in filtered),
            "sparkline": cache_sparkline,
        },
        "recent": [_session_summary(s) for s in filtered[:10]],
        "filters": _build_filter_facets(all_sessions),
    })


@app.get("/api/settings")
async def api_settings() -> JSONResponse:
    hooks = _detect_hooks()
    mcp_servers = _detect_mcp_servers()
    pricing_rows = [
        {
            "model": p.model,
            "provider": p.provider,
            "input": p.input,
            "output": p.output,
            "cacheWrite": p.cache_write,
            "cacheRead": p.cache_read,
            "notes": p.notes,
        }
        for p in PRICING
    ]
    paths = [
        ("claude code transcripts", str(settings.claude_projects)),
        ("codex transcripts", str(settings.codex_sessions)),
        ("codex archived transcripts", str(settings.codex_archive_sessions)),
        ("tracebook home", str(settings.tracebook_home)),
    ]
    return JSONResponse({
        "hooks": hooks,
        "mcp_servers": mcp_servers,
        "pricing": pricing_rows,
        "paths": [{"label": l, "path": p} for l, p in paths],
        "trace_paths": {
            "claude_projects": str(settings.claude_projects),
            "codex_sessions": str(settings.codex_sessions),
            "codex_archive_sessions": str(settings.codex_archive_sessions),
        },
        "about": {
            "version": __version__,
            "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "sessions": len(store.sessions),
            "daemon": "running",
            "license": "apache 2.0",
            "port": settings.port,
            "pid": os.getpid(),
            "uptime": _format_uptime(datetime.now(tz=timezone.utc) - APP_STARTED_AT),
        },
    })


@app.post("/api/settings/trace-paths")
async def api_update_trace_paths(update: TracePathUpdate) -> JSONResponse:
    payload = (
        update.model_dump(exclude_none=True)
        if hasattr(update, "model_dump")
        else update.dict(exclude_none=True)
    )
    if not payload:
        raise HTTPException(400, "no trace paths provided")
    settings.update_trace_paths(payload)
    store.refresh()
    return JSONResponse({
        "ok": True,
        "sessions": len(store.sessions),
        "paths": {
            "claude_projects": str(settings.claude_projects),
            "codex_sessions": str(settings.codex_sessions),
            "codex_archive_sessions": str(settings.codex_archive_sessions),
        },
        "restartRecommended": True,
        "message": "paths saved; restart Tracebook to move filesystem watchers to the new roots",
    })


# ─── Serialisation helpers ────────────────────────────────────────────────────

def _session_summary(s: Session) -> dict:
    now = datetime.now(tz=timezone.utc)
    from tracebook.parsers.claude import _relative_time
    live = _session_live(s, now)
    waiting = _session_waiting(s, now)
    return {
        "id": s.id,
        "short": s.short,
        "preview": s.preview,
        "cwd": s.cwd,
        "project": s.project,
        "branch": s.branch,
        "turns": s.turns,
        "cost": round(s.cost, 4),
        "duration": s.duration_str,
        "activeDurationMs": _session_active_duration_ms(s),
        "started": _relative_time(s.started_at, now),
        "last": "now" if live else _relative_time(s.last_at, now),
        "startedAt": s.started_at.isoformat() if s.started_at else None,
        "lastAt": s.last_at.isoformat() if s.last_at else None,
        "live": live,
        "waiting": waiting,
        "status": "running" if live else ("waiting" if waiting else "idle"),
        "provider": s.provider,
        "model": s.model,
        "resumeId": s.id,
        "resumeCommand": _resume_command(s),
        "lastAction": s.last_action,
        "tokens": _dashboard_tokens(s),
        "tokensIn": s.tokens_in,
        "tokensOut": s.tokens_out,
        "cacheWrite": s.cache_write,
        "cacheRead": s.cache_read,
        "contextUsed": s.context_used,
        "contextMax": s.context_max,
        "compressions": s.compressions,
    }


def _session_detail(s: Session) -> dict:
    trace_nodes = [_node_dict(n) for n in s.trace_nodes]
    _attach_hook_model_inputs(s, trace_nodes)
    summary = _session_summary(s)
    summary["trace"] = {
        "originAt": s.started_at.isoformat() if s.started_at else None,
        "totalDuration": s.trace_nodes[0].duration if s.trace_nodes else 0,
        "totalTokens": s.trace_nodes[0].tokens if s.trace_nodes else 0,
        "totalCacheRead": s.trace_nodes[0].cache_read if s.trace_nodes else 0,
        "totalCost": round(s.trace_nodes[0].cost if s.trace_nodes else 0, 4),
        "nodes": trace_nodes,
    }
    summary["traceSummary"] = _trace_summary(s)
    summary["transcript"] = s.transcript

    # Context budget estimation
    summary["contextBudget"] = _build_context_budget(s)

    # Observed extras (skills / sub-agents / mcp / memory)
    summary["contextItems"] = {
        "agents":  s.sub_agents,
        "skills":  s.skills_used,
        "mcp":     s.mcp_tools_used,
        "memory":  [{"path": p} for p in s.memory_reads],
        "compressions": s.compressions,
    }
    return summary


def _hook_matches_session(record: dict[str, Any], s: Session) -> bool:
    sid = str(record.get("session_id") or "")
    if sid and (sid == s.id or sid == s.short or s.id.startswith(sid) or sid.startswith(s.short)):
        return True
    transcript_path = str(record.get("transcript_path") or "")
    if transcript_path:
        try:
            if Path(transcript_path).expanduser().resolve() == s.path.resolve():
                return True
        except OSError:
            if transcript_path == str(s.path):
                return True
    return False


_HOOK_INPUT_CACHE: dict[str, Any] = {
    "path": "",
    "mtime_ns": -1,
    "size": -1,
    "records": [],
    "by_session": {},
    "by_path": {},
    "calls": 0,
    "last": "—",
}


def _build_hook_input_index(records: list[dict[str, Any]]) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    by_session: dict[str, list[dict[str, Any]]] = {}
    by_path: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        sid = str(record.get("session_id") or "")
        if sid:
            by_session.setdefault(sid, []).append(record)
        tpath = str(record.get("transcript_path") or "")
        if tpath:
            by_path.setdefault(tpath, []).append(record)
    return by_session, by_path


def _load_hook_model_inputs_cached() -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    path = settings.tracebook_home / "hooks.jsonl"
    if not path.exists():
        _HOOK_INPUT_CACHE["path"] = ""
        _HOOK_INPUT_CACHE["mtime_ns"] = -1
        _HOOK_INPUT_CACHE["size"] = -1
        _HOOK_INPUT_CACHE["records"] = []
        _HOOK_INPUT_CACHE["by_session"] = {}
        _HOOK_INPUT_CACHE["by_path"] = {}
        _HOOK_INPUT_CACHE["calls"] = 0
        _HOOK_INPUT_CACHE["last"] = "—"
        return [], {}, {}

    try:
        stats = path.stat()
    except OSError:
        return [], {}, {}

    if (
        _HOOK_INPUT_CACHE["path"] == str(path)
        and _HOOK_INPUT_CACHE["mtime_ns"] == stats.st_mtime_ns
        and _HOOK_INPUT_CACHE["size"] == stats.st_size
    ):
        return _HOOK_INPUT_CACHE["records"], _HOOK_INPUT_CACHE["by_session"], _HOOK_INPUT_CACHE["by_path"]

    records: list[dict[str, Any]] = []
    hook_calls = 0
    hook_last = "—"
    try:
        with path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if not line.strip():
                    continue
                hook_calls += 1
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                captured_at = str(record.get("captured_at", "") or "")
                if captured_at:
                    hook_last = captured_at
                if (
                    isinstance(record, dict)
                    and "model_input" in record
                ):
                    records.append(record)
    except OSError:
        return [], {}, {}

    by_session, by_path = _build_hook_input_index(records)
    _HOOK_INPUT_CACHE["path"] = str(path)
    _HOOK_INPUT_CACHE["mtime_ns"] = stats.st_mtime_ns
    _HOOK_INPUT_CACHE["size"] = stats.st_size
    _HOOK_INPUT_CACHE["records"] = records
    _HOOK_INPUT_CACHE["by_session"] = by_session
    _HOOK_INPUT_CACHE["by_path"] = by_path
    _HOOK_INPUT_CACHE["calls"] = hook_calls
    _HOOK_INPUT_CACHE["last"] = hook_last
    return records, by_session, by_path


def _load_hook_model_inputs(s: Session) -> list[dict[str, Any]]:
    all_records, by_session, by_path = _load_hook_model_inputs_cached()
    if not all_records:
        return []

    candidates: list[dict[str, Any]] = []
    seen: set[int] = set()

    for key in (s.id, s.short):
        if key and key in by_session:
            for record in by_session[key]:
                rid = id(record)
                if rid in seen:
                    continue
                seen.add(rid)
                candidates.append(record)

    transcript_path = str(s.path)
    for record in by_path.get(transcript_path, []):
        rid = id(record)
        if rid in seen:
            continue
        seen.add(rid)
        candidates.append(record)

    if not candidates:
        for record in all_records:
            if _hook_matches_session(record, s):
                candidates.append(record)
        return candidates

    return [record for record in candidates if _hook_matches_session(record, s)]


def _attach_hook_model_inputs(s: Session, nodes: list[dict[str, Any]]) -> None:
    hook_inputs = _load_hook_model_inputs(s)
    if not hook_inputs:
        return
    llm_nodes = [node for node in nodes if node.get("type") == "llm"]
    if not llm_nodes:
        return
    for idx, record in enumerate(hook_inputs):
        node = llm_nodes[min(idx, len(llm_nodes) - 1)]
        detail = node.setdefault("detail", {})
        previous_input = detail.get("input") or {}
        detail["input"] = {
            "source": "hook_exact",
            "capture": "exact_model_request",
            "captured_at": record.get("captured_at", ""),
            "event": record.get("event", ""),
            "request_id": record.get("request_id", ""),
            "model": record.get("model", ""),
            "payload": record.get("model_input"),
            "log_replay_fallback": previous_input,
        }
        attrs = detail.setdefault("attributes", {})
        attrs["input_source"] = "hook_exact"
        attrs["hook_capture_event"] = record.get("event", "")


def _node_dict(n: TraceNode) -> dict:
    attributes = {
        "id": n.id,
        "type": n.type,
        "depth": n.depth,
        "parent": n.parent,
        "children": n.children,
        "live": n.live,
        "status": n.status,
    }
    attributes.update(n.attributes or {})
    return {
        "id": n.id,
        "type": n.type,
        "name": n.name,
        "start": n.start,
        "duration": n.duration,
        "tokens": n.tokens,
        "cost": round(n.cost, 6),
        "depth": n.depth,
        "parent": n.parent,
        "live": n.live,
        "preview": n.preview,
        "inputTokens": n.input_tokens,
        "outputTokens": n.output_tokens,
        "cacheWrite": n.cache_write,
        "cacheRead": n.cache_read,
        "status": n.status,
        "children": n.children,
        "detail": {
            "input": n.input_payload or {},
            "output": n.output_payload or {},
            "attributes": attributes,
        },
    }


def _throughput_tokens(s: Session) -> int:
    return s.tokens_in + s.tokens_out + s.cache_write


def _dashboard_tokens(s: Session) -> int:
    """Dashboard throughput is generated output only; cost still uses all usage."""
    return s.tokens_out


def _session_live(s: Session, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(tz=timezone.utc)
    if not s.last_at:
        return False
    last_at = s.last_at
    if last_at.tzinfo is None:
        last_at = last_at.replace(tzinfo=timezone.utc)
    age = (now - last_at).total_seconds()
    return 0 <= age < 60


def _session_waiting(s: Session, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(tz=timezone.utc)
    if not s.started_at:
        return False
    started_at = s.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    age = (now - started_at).total_seconds()
    return 0 <= age < 30 * 60


def _session_matches(s: Session, provider: str = "all", model: str = "all") -> bool:
    if provider != "all" and s.provider != provider:
        return False
    if model != "all" and model.lower() not in s.model.lower():
        return False
    return True


def _filter_sessions(
    sessions: list[Session],
    *,
    period: str,
    provider: str,
    model: str,
    now: datetime,
    start_at: Optional[datetime] = None,
    end_at: Optional[datetime] = None,
) -> list[Session]:
    rows = [s for s in sessions if _session_matches(s, provider, model)]
    if start_at or end_at:
        return [
            s for s in rows
            if s.last_at
            and (start_at is None or s.last_at >= start_at)
            and (end_at is None or s.last_at < end_at)
        ]
    if period == "all":
        return rows
    try:
        days = int(period)
    except ValueError:
        return rows
    cutoff = now - timedelta(days=days)
    return [s for s in rows if s.last_at and s.last_at >= cutoff]


def _resume_command(s: Session) -> str:
    if s.provider == "openai":
        return f"codex resume {s.id}"
    if s.provider == "google":
        return s.id
    return f"claude --resume {s.id}"


def _build_filter_facets(sessions: list[Session]) -> dict:
    providers: dict[str, int] = {}
    models_by_provider: dict[str, dict[str, int]] = {}
    for s in sessions:
        providers[s.provider] = providers.get(s.provider, 0) + 1
        models_by_provider.setdefault(s.provider, {})
        models_by_provider[s.provider][s.model] = models_by_provider[s.provider].get(s.model, 0) + 1
    return {
        "providers": [{"value": k, "label": k, "count": v} for k, v in sorted(providers.items())],
        "modelsByProvider": {
            provider: [
                {"value": model, "label": model, "count": count}
                for model, count in sorted(models.items(), key=lambda item: (-item[1], item[0]))
            ]
            for provider, models in models_by_provider.items()
        },
    }


def _build_context_budget(s: Session) -> dict:
    used = s.context_used
    max_ctx = s.context_max or 200_000
    if used > max_ctx:                       # never exceed 100% used
        max_ctx = max(max_ctx, used)

    # Heuristic breakdown — real per-category data requires CLAUDE.md parsing
    system_prompt = 9500
    mcp_tools = 2100 if not s.mcp_tools_used else 2100 + 800 * len(s.mcp_tools_used)
    system_tools = min(max(used // 8, 4000), 22400)
    messages = max(used - system_tools - system_prompt - mcp_tools, 0)

    return {
        "model": s.model,
        "contextMax": max_ctx,
        "contextUsed": used,
        "categories": [
            {"key": "system_prompt",  "label": "system prompt",      "tokens": system_prompt, "color": "#34d399"},
            {"key": "system_tools",   "label": "system tools",       "tokens": system_tools,  "color": "#6ee7b7"},
            {"key": "mcp_tools",      "label": "mcp tools",          "tokens": mcp_tools,     "color": "#67e8f9"},
            {"key": "messages",       "label": "messages",           "tokens": messages,      "color": "#7dd3fc"},
        ],
    }


def _trace_interval_duration(
    nodes: list[TraceNode],
    wall_ms: int,
    allowed_types: set[str],
    *,
    skip_visual_noise: bool = False,
) -> int:
    """Return non-overlapping duration for trace nodes, clipped to the run wall time."""
    if wall_ms <= 0:
        return 0
    intervals: list[tuple[int, int]] = []
    for node in nodes:
        if _trace_node_is_noise(node):
            continue
        if skip_visual_noise and _trace_node_is_visual_noise(node):
            continue
        if node.type not in allowed_types:
            continue
        start = max(0, min(wall_ms, int(node.start or 0)))
        end = max(start, min(wall_ms, start + int(node.duration or 0)))
        if end > start:
            intervals.append((start, end))
    if not intervals:
        return 0
    intervals.sort()
    total = 0
    cur_start, cur_end = intervals[0]
    for start, end in intervals[1:]:
        if start <= cur_end:
            cur_end = max(cur_end, end)
            continue
        total += cur_end - cur_start
        cur_start, cur_end = start, end
    total += cur_end - cur_start
    return total


def _session_active_duration_ms(s: Session) -> int:
    """Non-overlapping time where model or tools were actively running."""
    wall_ms = s.trace_nodes[0].duration if s.trace_nodes else 0
    return _trace_interval_duration(
        s.trace_nodes,
        wall_ms,
        {"llm", "tool", "mcp", "skill"},
        skip_visual_noise=True,
    )


def _trace_node_is_noise(n: TraceNode) -> bool:
    return bool((n.attributes or {}).get("noise"))


def _trace_node_is_visual_noise(n: TraceNode) -> bool:
    attrs = n.attributes or {}
    return bool(attrs.get("noise") or attrs.get("visual_noise"))


def _trace_summary(s: Session) -> dict:
    nodes = [n for n in s.trace_nodes if not _trace_node_is_noise(n)]
    visible_nodes = [n for n in nodes if not _trace_node_is_visual_noise(n)]
    llm = [n for n in visible_nodes if n.type == "llm"]
    tools = [n for n in nodes if n.type in {"tool", "mcp", "skill"}]
    tool_counts: dict[str, int] = {}
    failed_tools = 0
    longest_tool = None
    for n in tools:
        tool_counts[n.name] = tool_counts.get(n.name, 0) + 1
        output = n.output_payload or {}
        output_text = " ".join(str(output.get(k, "")) for k in ("preview", "result", "message"))
        status = (n.status or "").lower()
        failed = status in {"failed", "error", "cancelled"} or bool(re.search(r"Process exited with code\s+[1-9]\d*", output_text))
        if failed:
            failed_tools += 1
        if longest_tool is None or n.duration > longest_tool.duration:
            longest_tool = n
    wall_ms = s.trace_nodes[0].duration if s.trace_nodes else 0
    model_ms = _trace_interval_duration(s.trace_nodes, wall_ms, {"llm"}, skip_visual_noise=True)
    tool_ms = _trace_interval_duration(s.trace_nodes, wall_ms, {"tool", "mcp", "skill"})
    input_side = s.tokens_in + s.cache_write + s.cache_read
    cache_hit = s.cache_read / input_side if input_side else 0
    minutes = max(wall_ms / 60000, 1 / 60)
    return {
        "wallTimeMs": wall_ms,
        "modelTimeMs": model_ms,
        "toolTimeMs": tool_ms,
        "llmCalls": len(llm),
        "toolCalls": len(tools),
        "failedTools": failed_tools,
        "uniqueTools": len(tool_counts),
        "topTools": [
            {"name": name, "count": count}
            for name, count in sorted(tool_counts.items(), key=lambda x: (-x[1], x[0]))[:6]
        ],
        "longestTool": (
            {"name": longest_tool.name, "durationMs": longest_tool.duration}
            if longest_tool else None
        ),
        "tokens": _throughput_tokens(s),
        "cacheRead": s.cache_read,
        "cacheHitRatio": round(cache_hit, 4),
        "cost": round(s.cost, 4),
        "costPerMinute": round(s.cost / minutes, 4),
    }


def _build_sparklines(sessions: list[Session], period: str) -> tuple[list, list, list]:
    now = datetime.now(tz=timezone.utc)
    points = 12
    try:
        days = int(period) if period != "all" else 90
    except ValueError:
        days = 14
    bucket_hours = days * 24 / points

    spark_tokens: list[float] = []
    spark_cost: list[float] = []
    spark_sessions: list[int] = []

    for i in range(points):
        end = now - timedelta(hours=bucket_hours * (points - 1 - i))
        start = end - timedelta(hours=bucket_hours)
        bucket = [
            s for s in sessions
            if s.last_at and start <= s.last_at < end
        ]
        tokens = sum(_dashboard_tokens(s) for s in bucket)
        cost = sum(s.cost for s in bucket)
        spark_tokens.append(tokens / 1000)
        spark_cost.append(cost)
        spark_sessions.append(len(bucket))

    return spark_tokens, spark_cost, spark_sessions


def _build_cache_sparkline(sessions: list[Session], period: str) -> list[float]:
    now = datetime.now(tz=timezone.utc)
    points = 12
    try:
        days = int(period) if period != "all" else 90
    except ValueError:
        days = 14
    bucket_hours = days * 24 / points

    ratios: list[float] = []
    last_ratio: Optional[float] = None
    for i in range(points):
        end = now - timedelta(hours=bucket_hours * (points - 1 - i))
        start = end - timedelta(hours=bucket_hours)
        bucket = [
            s for s in sessions
            if s.last_at and start <= s.last_at < end
        ]
        read = sum(s.cache_read for s in bucket)
        write = sum(s.cache_write for s in bucket)
        uncached = sum(s.tokens_in for s in bucket)
        total = read + write + uncached
        if total:
            last_ratio = read / total
            ratios.append(round(last_ratio, 4))
        else:
            ratios.append(round(last_ratio or 0, 4))

    if not any(ratios) and sessions:
        read = sum(s.cache_read for s in sessions)
        write = sum(s.cache_write for s in sessions)
        uncached = sum(s.tokens_in for s in sessions)
        total = read + write + uncached
        ratio = round(read / total, 4) if total else 0
        ratios = [ratio for _ in range(points)]

    return ratios


def _series_key(s: Session) -> str:
    m = s.model.lower()
    if s.provider == "anthropic":
        if "opus" in m:
            return "opus"
        if "sonnet" in m:
            return "sonnet"
        if "haiku" in m:
            return "haiku"
        return "anthropic_other"
    if s.provider == "openai":
        if "codex" in m:
            return "codex"
        if m.startswith(("o1", "o3", "o4")):
            return "reasoning"
        return "gpt"
    if s.provider == "google":
        return "gemini"
    return "other"


def _chart_series(sessions: list[Session], provider: str) -> list[dict]:
    palette = {
        "opus": ("opus", "#34d399"),
        "sonnet": ("sonnet", "#7dd3fc"),
        "haiku": ("haiku", "#a78bfa"),
        "anthropic_other": ("claude other", "#6ee7b7"),
        "codex": ("codex", "#fbbf24"),
        "gpt": ("gpt", "#fb7185"),
        "reasoning": ("reasoning", "#f97316"),
        "gemini": ("gemini", "#67e8f9"),
        "other": ("other", "#a1a1aa"),
    }
    default_keys = {
        "anthropic": ["opus", "sonnet", "haiku"],
        "openai": ["codex", "gpt", "reasoning"],
        "google": ["gemini"],
        "all": ["opus", "sonnet", "haiku", "codex", "gpt", "gemini"],
    }.get(provider, ["other"])
    keys = {k for k in default_keys}
    keys.update(_series_key(s) for s in sessions)
    order = ["opus", "sonnet", "haiku", "anthropic_other", "codex", "gpt", "reasoning", "gemini", "other"]
    return [
        {"key": key, "label": palette[key][0], "color": palette[key][1]}
        for key in order
        if key in keys
    ]


def _build_chart(sessions: list[Session], period: str, series: list[dict]) -> list[dict]:
    now = datetime.now(tz=timezone.utc)
    try:
        days = int(period) if period != "all" else 30
    except ValueError:
        days = 14

    days = min(days, 90)  # cap to avoid massive charts
    chart: list[dict] = []

    for i in range(days - 1, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        day_sessions = [
            s for s in sessions
            if s.last_at and day_start <= s.last_at < day_end
        ]

        buckets = {s["key"]: 0 for s in series}
        cost = 0.0
        for s in day_sessions:
            t = _dashboard_tokens(s)
            key = _series_key(s)
            buckets[key] = buckets.get(key, 0) + t
            buckets[f"{key}Cost"] = round(buckets.get(f"{key}Cost", 0) + s.cost, 6)
            cost += s.cost
        total = sum(buckets.get(s["key"], 0) for s in series)

        row = {
            "day": day_start.strftime("%m-%d"),
            "label": str(day_start.day),
            "total": total,
            "cost": round(cost, 4),
            "today": i == 0,
        }
        row.update(buckets)
        chart.append(row)

    return chart


def _build_project_pie(sessions: list[Session]) -> list[dict]:
    project_map: dict[str, dict] = {}
    for s in sessions:
        p = s.project
        if p not in project_map:
            project_map[p] = {"project": p, "tokens": 0, "cost": 0.0, "sessions": 0}
        project_map[p]["tokens"] += _dashboard_tokens(s)
        project_map[p]["cost"] += s.cost
        project_map[p]["sessions"] += 1

    rows = sorted(project_map.values(), key=lambda r: r["cost"], reverse=True)
    for r in rows:
        r["cost"] = round(r["cost"], 4)
    return rows[:8]


def _detect_hooks() -> list[dict]:
    hook_log = _hook_log_stats()
    hooks: list[dict] = []
    for claude_settings_path in [
        Path("~/.claude/settings.json").expanduser(),
        Path("~/.claude/settings.local.json").expanduser(),
    ]:
        if not claude_settings_path.exists():
            continue
        try:
            data = json.loads(claude_settings_path.read_text())
            raw_hooks = data.get("hooks", {})
            for name, config in raw_hooks.items():
                hooks.append({
                    "name": f"claude:{name}",
                    "status": "configured",
                    "calls": 0,
                    "last": "—",
                    "source": str(claude_settings_path),
                })
        except Exception:
            pass
    for codex_hooks_path in [
        Path("~/.codex/hooks.json").expanduser(),
        Path("~/.codex/config.toml").expanduser(),
    ]:
        if not codex_hooks_path.exists():
            continue
        try:
            if codex_hooks_path.suffix == ".json":
                data = json.loads(codex_hooks_path.read_text())
                raw_hooks = data.get("hooks", {})
                for name in raw_hooks:
                    hooks.append({
                        "name": f"codex:{name}",
                        "status": "configured",
                        "calls": 0,
                        "last": "—",
                        "source": str(codex_hooks_path),
                    })
            else:
                data = tomllib.loads(codex_hooks_path.read_text())
                raw_hooks = data.get("hooks", {})
                if isinstance(raw_hooks, dict):
                    for name in raw_hooks:
                        hooks.append({
                            "name": f"codex:{name}",
                            "status": "configured",
                            "calls": 0,
                            "last": "—",
                            "source": str(codex_hooks_path),
                        })
        except Exception:
            pass
    if hook_log["calls"]:
        hooks.append({
            "name": "tracebook:capture",
            "status": "recording",
            "calls": hook_log["calls"],
            "last": hook_log["last"],
            "source": str(settings.tracebook_home / "hooks.jsonl"),
        })
    if not hooks:
        hooks = [
            {"name": "claude:PreToolUse",   "status": "not registered", "calls": 0, "last": "—"},
            {"name": "claude:PostToolUse",  "status": "not registered", "calls": 0, "last": "—"},
            {"name": "codex:PreToolUse",    "status": "not registered", "calls": 0, "last": "—"},
            {"name": "codex:PostToolUse",   "status": "not registered", "calls": 0, "last": "—"},
            {"name": "tracebook:capture",   "status": "not registered", "calls": 0, "last": "—"},
        ]
    return hooks


def _hook_log_stats() -> dict:
    path = settings.tracebook_home / "hooks.jsonl"
    if not path.exists():
        return {"calls": 0, "last": "—"}
    _load_hook_model_inputs_cached()
    return {
        "calls": int(_HOOK_INPUT_CACHE["calls"]),
        "last": str(_HOOK_INPUT_CACHE["last"]),
    }


def _detect_mcp_servers() -> list[dict]:
    servers: list[dict] = []

    def add(name: str, transport: str, source: str, enabled: bool = True) -> None:
        if not name:
            return
        if any(s.get("name") == name and s.get("source") == source for s in servers):
            return
        servers.append({
            "name": name,
            "transport": transport or "stdio",
            "status": "configured" if enabled else "disabled",
            "tools": 0,
            "calls": 0,
            "source": source,
        })

    for cfg_path in [
        Path("~/.claude/settings.json").expanduser(),
        Path("~/.claude/settings.local.json").expanduser(),
    ]:
        if not cfg_path.exists():
            continue
        try:
            data = json.loads(cfg_path.read_text())
            for name, cfg in data.get("mcpServers", {}).items():
                transport = cfg.get("type") or ("http" if cfg.get("url") else "stdio")
                add(name, transport, "claude", cfg.get("enabled", True))
        except Exception:
            pass

    codex_config = Path("~/.codex/config.toml").expanduser()
    if codex_config.exists():
        try:
            data = tomllib.loads(codex_config.read_text())
            for name, cfg in (data.get("mcp_servers") or {}).items():
                transport = "http" if cfg.get("url") else "stdio"
                add(name, transport, "codex", cfg.get("enabled", True))
        except Exception:
            pass

    for root in [Path("~/.claude/plugins/cache").expanduser()]:
        if not root.exists():
            continue
        for mcp_file in root.rglob(".mcp.json"):
            try:
                data = json.loads(mcp_file.read_text())
                for name, cfg in (data.get("mcpServers") or {}).items():
                    transport = cfg.get("type") or ("http" if cfg.get("url") else "stdio")
                    add(name, transport, "claude plugin", cfg.get("enabled", True))
            except Exception:
                continue
    return servers
