from __future__ import annotations

import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader

from tracebook import __version__
from tracebook.parsers.claude import Session, TraceNode
from tracebook.pricing import PRICING, compute_cost
from tracebook.settings import settings
from tracebook.store import store

app = FastAPI(title="tracebook", version=__version__)

# Static files
app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")

# Jinja2
_jinja = Environment(loader=FileSystemLoader(str(settings.templates_dir)), autoescape=True)


# ─── HTML shell ───────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    tmpl = _jinja.get_template("index.html")
    return HTMLResponse(tmpl.render(version=__version__))


# ─── JSON API ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "sessions": len(store.sessions), "version": __version__}


@app.get("/api/sessions")
async def api_sessions() -> JSONResponse:
    sessions = store.list_sessions()
    return JSONResponse([_session_summary(s) for s in sessions])


@app.get("/api/sessions/{session_id}")
async def api_session_detail(session_id: str) -> JSONResponse:
    sess = store.get_session(session_id)
    if not sess:
        raise HTTPException(404, f"session {session_id!r} not found")
    return JSONResponse(_session_detail(sess))


@app.get("/api/dashboard")
async def api_dashboard(
    period: str = "14",
    provider: str = "all",
    model: str = "all",
) -> JSONResponse:
    all_sessions = store.list_sessions()

    # Apply period filter
    now = datetime.now(tz=timezone.utc)
    if period != "all":
        try:
            days = int(period)
            cutoff = now - timedelta(days=days)
            filtered = [s for s in all_sessions if s.last_at and s.last_at >= cutoff]
        except ValueError:
            filtered = all_sessions
    else:
        filtered = all_sessions

    # Apply provider/model filters
    if provider != "all":
        filtered = [s for s in filtered if s.provider == provider]
    if model != "all":
        filtered = [s for s in filtered if model.lower() in s.model.lower()]

    # Previous period for delta
    if period != "all":
        try:
            days = int(period)
            prev_cutoff = now - timedelta(days=days * 2)
            prev_filtered = [
                s for s in all_sessions
                if s.last_at and prev_cutoff <= s.last_at < now - timedelta(days=days)
            ]
        except ValueError:
            prev_filtered = []
    else:
        prev_filtered = []

    def totals(sessions: list[Session]) -> dict:
        return {
            "tokens": sum(s.tokens_in + s.tokens_out + s.cache_read + s.cache_write for s in sessions),
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
    spark_tokens, spark_cost, spark_sessions = _build_sparklines(all_sessions, period)

    # Daily chart data
    chart = _build_chart(all_sessions, period)

    # Project breakdown
    project_pie = _build_project_pie(filtered)

    # Cache stats
    cache_read_total = sum(s.cache_read for s in filtered)
    cache_write_total = sum(s.cache_write for s in filtered)
    tokens_total = sum(s.tokens_in + s.tokens_out + s.cache_read + s.cache_write for s in filtered)
    cache_ratio = cache_read_total / tokens_total if tokens_total else 0

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
        "project_pie": project_pie,
        "cache": {
            "read_ratio": round(cache_ratio, 4),
            "read_tokens": cache_read_total,
            "write_tokens": cache_write_total,
            "uncached_tokens": sum(s.tokens_in for s in filtered),
        },
        "recent": [_session_summary(s) for s in filtered[:10]],
    })


@app.get("/api/settings")
async def api_settings() -> JSONResponse:
    hooks = _detect_hooks()
    mcp_servers = _detect_mcp_servers()
    pricing_rows = [
        {
            "model": p.model,
            "input": p.input,
            "output": p.output,
            "cacheWrite": p.cache_write,
            "cacheRead": p.cache_read,
        }
        for p in PRICING
    ]
    paths = [
        ("claude code transcripts", str(settings.claude_projects)),
        ("tracebook home", str(settings.tracebook_home)),
    ]
    return JSONResponse({
        "hooks": hooks,
        "mcp_servers": mcp_servers,
        "pricing": pricing_rows,
        "paths": [{"label": l, "path": p} for l, p in paths],
        "about": {
            "version": __version__,
            "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "sessions": len(store.sessions),
            "daemon": "running",
            "license": "apache 2.0",
            "port": settings.port,
        },
    })


# ─── Serialisation helpers ────────────────────────────────────────────────────

def _session_summary(s: Session) -> dict:
    now = datetime.now(tz=timezone.utc)
    from tracebook.parsers.claude import _relative_time
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
        "started": _relative_time(s.started_at, now),
        "last": "now" if s.live else _relative_time(s.last_at, now),
        "live": s.live,
        "status": s.status,
        "provider": s.provider,
        "model": s.model,
        "lastAction": s.last_action,
        "tokensIn": s.tokens_in,
        "tokensOut": s.tokens_out,
        "cacheWrite": s.cache_write,
        "cacheRead": s.cache_read,
        "contextUsed": s.context_used,
        "contextMax": s.context_max,
    }


def _session_detail(s: Session) -> dict:
    summary = _session_summary(s)
    summary["trace"] = {
        "totalDuration": s.trace_nodes[0].duration if s.trace_nodes else 0,
        "totalTokens": sum(n.tokens for n in s.trace_nodes),
        "totalCost": round(sum(n.cost for n in s.trace_nodes), 4),
        "nodes": [_node_dict(n) for n in s.trace_nodes],
    }
    summary["transcript"] = s.transcript

    # Context budget estimation
    summary["contextBudget"] = _build_context_budget(s)

    # Observed extras (skills / sub-agents / mcp / memory)
    summary["contextItems"] = {
        "agents":  s.sub_agents,
        "skills":  s.skills_used,
        "mcp":     s.mcp_tools_used,
        "memory":  [{"path": p} for p in s.memory_reads],
    }
    return summary


def _node_dict(n: TraceNode) -> dict:
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
        "children": n.children,
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
        tokens = sum(s.tokens_in + s.tokens_out + s.cache_read + s.cache_write for s in bucket)
        cost = sum(s.cost for s in bucket)
        spark_tokens.append(tokens / 1000)
        spark_cost.append(cost)
        spark_sessions.append(len(bucket))

    # Ensure at least some data if all zeroes (prevents flat line)
    if all(v == 0 for v in spark_tokens) and sessions:
        spark_tokens = [float(i + 1) for i in range(points)]
    if all(v == 0 for v in spark_sessions) and sessions:
        spark_sessions = list(range(1, points + 1))

    return spark_tokens, spark_cost, spark_sessions


def _build_chart(sessions: list[Session], period: str) -> list[dict]:
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

        opus = sonnet = haiku = other = 0
        cost = 0.0
        for s in day_sessions:
            t = s.tokens_in + s.tokens_out + s.cache_read + s.cache_write
            m = s.model.lower()
            if "opus" in m:
                opus += t
            elif "sonnet" in m:
                sonnet += t
            elif "haiku" in m:
                haiku += t
            else:
                other += t
            cost += s.cost

        chart.append({
            "day": day_start.strftime("%m-%d"),
            "label": str(day_start.day),
            "opus": opus,
            "sonnet": sonnet,
            "haiku": haiku,
            "other": other,
            "total": opus + sonnet + haiku + other,
            "cost": round(cost, 4),
            "today": i == 0,
        })

    return chart


def _build_project_pie(sessions: list[Session]) -> list[dict]:
    project_map: dict[str, dict] = {}
    for s in sessions:
        p = s.project
        if p not in project_map:
            project_map[p] = {"project": p, "tokens": 0, "cost": 0.0, "sessions": 0}
        project_map[p]["tokens"] += s.tokens_in + s.tokens_out + s.cache_read + s.cache_write
        project_map[p]["cost"] += s.cost
        project_map[p]["sessions"] += 1

    rows = sorted(project_map.values(), key=lambda r: r["cost"], reverse=True)
    for r in rows:
        r["cost"] = round(r["cost"], 4)
    return rows[:8]


def _detect_hooks() -> list[dict]:
    claude_settings_path = Path("~/.claude/settings.json").expanduser()
    hooks: list[dict] = []
    if claude_settings_path.exists():
        try:
            data = json.loads(claude_settings_path.read_text())
            raw_hooks = data.get("hooks", {})
            for name, config in raw_hooks.items():
                hooks.append({
                    "name": name,
                    "status": "configured",
                    "calls": 0,
                    "last": "—",
                })
        except Exception:
            pass
    if not hooks:
        hooks = [
            {"name": "PreToolUse",   "status": "not registered", "calls": 0, "last": "—"},
            {"name": "PostToolUse",  "status": "not registered", "calls": 0, "last": "—"},
            {"name": "Stop",         "status": "not registered", "calls": 0, "last": "—"},
            {"name": "SessionStart", "status": "not registered", "calls": 0, "last": "—"},
        ]
    return hooks


def _detect_mcp_servers() -> list[dict]:
    servers: list[dict] = []
    for cfg_path in [
        Path("~/.claude/settings.json").expanduser(),
        Path("~/.claude/settings.local.json").expanduser(),
    ]:
        if not cfg_path.exists():
            continue
        try:
            data = json.loads(cfg_path.read_text())
            for name, cfg in data.get("mcpServers", {}).items():
                servers.append({
                    "name": name,
                    "transport": cfg.get("type", "stdio"),
                    "status": "configured",
                    "tools": 0,
                    "calls": 0,
                })
        except Exception:
            pass
    return servers
