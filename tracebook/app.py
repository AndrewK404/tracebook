"""FastAPI app: server-rendered HTML for every screen."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from tracebook import __version__, store
from tracebook.parsers.claude import Session, Turn
from tracebook.settings import CLAUDE_PROJECTS_DIR, TRACEBOOK_HOME
from tracebook.watcher import start_watcher

THIS_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = THIS_DIR / "templates"
STATIC_DIR = THIS_DIR / "static"


# ---------------------------------------------------------------------------
# Jinja filters
# ---------------------------------------------------------------------------


def _ago(value: datetime | None, now: datetime | None = None) -> str:
    if value is None:
        return "—"
    now = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    delta = (now - value).total_seconds()
    if delta < 0:
        return "just now"
    if delta < 5:
        return "just now"
    if delta < 60:
        return f"{int(delta)}s ago"
    if delta < 3600:
        return f"{int(delta // 60)}m ago"
    if delta < 86400:
        return f"{int(delta // 3600)}h ago"
    if delta < 86400 * 2:
        return "yesterday"
    if delta < 86400 * 7:
        return f"{int(delta // 86400)}d ago"
    return value.strftime("%Y-%m-%d")


def _money(value: float | int | None) -> str:
    if value is None:
        return "$0.00"
    return f"${float(value):,.2f}"


def _money_fine(value: float | int | None) -> str:
    """Three-decimal money for very small per-turn costs."""
    if value is None:
        return "$0.00"
    f = float(value)
    if abs(f) < 0.01:
        return f"${f:.4f}"
    return f"${f:,.2f}"


def _commas(value: int | float | None) -> str:
    if value is None:
        return "0"
    return f"{int(value):,}"


def _short_path(value: str, max_len: int = 64) -> str:
    """Shorten a filesystem path by collapsing leading segments with `…/`,
    while preserving the final segment in full."""
    if not value:
        return ""
    if len(value) <= max_len:
        return value
    parts = value.split("/")
    if len(parts) <= 2:
        return "…" + value[-(max_len - 1):]
    last = parts[-1]
    # Walk back from the end, accumulating segments until we'd overflow.
    out = last
    for seg in reversed(parts[:-1]):
        candidate = seg + "/" + out
        if len(candidate) + 2 > max_len:  # 2 for "…/"
            return "…/" + out
        out = candidate
    return out


def _humanize_bytes(n: int | None) -> str:
    if not n:
        return "0 B"
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024  # type: ignore[assignment]
    return f"{n:.1f} TB"


def _short_id(value: str) -> str:
    if not value:
        return ""
    return value.split("-", 1)[0][:8].upper()


def _tojson(value: Any) -> str:
    try:
        return json.dumps(value, indent=2, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):  # noqa: ARG001
        observer = start_watcher()
        try:
            yield
        finally:
            if observer is not None:
                observer.stop()
                observer.join(timeout=2.0)

    app = FastAPI(title="tracebook", version=__version__, lifespan=lifespan)
    templates = Jinja2Templates(directory=str(TEMPLATE_DIR))
    templates.env.filters["ago"] = _ago
    templates.env.filters["money"] = _money
    templates.env.filters["money_fine"] = _money_fine
    templates.env.filters["commas"] = _commas
    templates.env.filters["short_path"] = _short_path
    templates.env.filters["humanize_bytes"] = _humanize_bytes
    templates.env.filters["short_id"] = _short_id
    templates.env.filters["tojson_pretty"] = _tojson

    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    def _ctx(request: Request, **extra: Any) -> dict[str, Any]:
        kpis = store.get_kpis()
        return {
            "request": request,
            "version": __version__,
            "kpis": kpis,
            "claude_projects": str(CLAUDE_PROJECTS_DIR),
            "tracebook_home": str(TRACEBOOK_HOME),
            "now": datetime.now(timezone.utc),
            **extra,
        }

    # ---- Routes ----------------------------------------------------------

    @app.get("/", response_class=HTMLResponse)
    def dashboard(request: Request) -> Any:
        sessions = store.list_sessions()
        live_session = next((s for s in sessions if s.is_live), None)
        recent = sessions[:8]
        projects = store.get_projects()
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            _ctx(
                request,
                sessions=sessions,
                live_session=live_session,
                recent_sessions=recent,
                projects=projects,
                page="dashboard",
            ),
        )

    @app.get("/sessions", response_class=HTMLResponse)
    def sessions_index(request: Request, limit: int = 200) -> Any:
        all_sessions = store.list_sessions()
        sessions = all_sessions[: max(1, min(limit, 1000))]
        return templates.TemplateResponse(
            request,
            "sessions.html",
            _ctx(
                request,
                sessions=sessions,
                total_count=len(all_sessions),
                shown_count=len(sessions),
                total_cost=sum(s.total_cost_usd for s in all_sessions),
                live_count=sum(1 for s in all_sessions if s.is_live),
                page="sessions",
            ),
        )

    @app.get("/sessions/{session_id}", response_class=HTMLResponse)
    def session_detail(request: Request, session_id: str) -> Any:
        try:
            session = store.get_session(session_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail="session not found") from exc
        return templates.TemplateResponse(
            request,
            "session_detail.html",
            _ctx(
                request,
                session=session,
                page="sessions",
            ),
        )

    @app.get("/cost", response_class=HTMLResponse)
    def cost(request: Request) -> Any:
        sessions = store.list_sessions()
        kpis = store.get_kpis()
        # weekly + all-time totals
        now = datetime.now(timezone.utc)
        week_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        from datetime import timedelta as _td
        week_start -= _td(days=now.weekday())
        cost_week = sum(
            s.total_cost_usd
            for s in sessions
            if s.last_activity_at and s.last_activity_at >= week_start
        )
        cache_savings = _compute_cache_savings(sessions)
        daily = store.daily_cost_series(days=14)
        prompts = store.top_prompts(window="today", limit=5)
        # Render chart geometry server-side so we don't need any JS.
        chart = _build_chart(daily)
        return templates.TemplateResponse(
            request,
            "cost.html",
            _ctx(
                request,
                sessions=sessions,
                kpis=kpis,
                cost_week=cost_week,
                cache_savings=cache_savings,
                daily=daily,
                prompts=prompts,
                chart=chart,
                page="cost",
            ),
        )

    @app.get("/api/sessions")
    def api_sessions() -> JSONResponse:
        return JSONResponse([_session_summary(s) for s in store.list_sessions()])

    @app.get("/healthz")
    def healthz() -> dict[str, Any]:
        return {"ok": True, "version": __version__}

    return app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _session_summary(s: Session) -> dict[str, Any]:
    return {
        "id": s.id,
        "short_id": s.short_id,
        "cwd": s.cwd,
        "project_name": s.project_name,
        "model": s.model,
        "turns": len(s.turns),
        "cost_usd": round(s.total_cost_usd, 4),
        "size_bytes": s.size_bytes,
        "is_live": s.is_live,
        "first_user_prompt": s.first_user_prompt,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "last_activity_at": s.last_activity_at.isoformat() if s.last_activity_at else None,
    }


def _compute_cache_savings(sessions: list[Session]) -> float:
    """Estimate $ saved vs the same tokens billed at full input price."""
    from tracebook.settings import price_for, load_pricing

    pricing = load_pricing()
    saved = 0.0
    for s in sessions:
        if not s.total_cache_read_tokens:
            continue
        p = price_for(s.model, pricing)
        # Cache reads cost cache_read_per_mtok; without cache they'd cost input_per_mtok.
        diff = (p.input_per_mtok - p.cache_read_per_mtok) * s.total_cache_read_tokens
        saved += diff / 1_000_000
    return saved


def _build_chart(daily: list[Any]) -> dict[str, Any]:
    """Pre-compute SVG bar geometry for the 14-day chart."""
    width = 560
    height = 160
    bars: list[dict[str, Any]] = []
    if not daily:
        return {"bars": bars, "width": width, "height": height, "max": 0.0, "ticks": []}

    max_cost = max((d.cost for d in daily), default=0.0)
    if max_cost <= 0:
        max_cost = 1.0  # avoid div-by-zero
    # Round max up to a "nice" tick.
    nice_max = _nice_ceil(max_cost)
    chart_left = 32
    chart_right = width
    chart_top = 20
    chart_bottom = 140
    span = chart_right - chart_left
    n = len(daily)
    bar_w = max(8.0, (span / n) * 0.55)
    step = span / n if n else 0
    for i, d in enumerate(daily):
        x = chart_left + i * step + (step - bar_w) / 2
        h = (d.cost / nice_max) * (chart_bottom - chart_top) if nice_max else 0
        y = chart_bottom - h
        bars.append(
            {
                "x": round(x, 2),
                "y": round(y, 2),
                "w": round(bar_w, 2),
                "h": round(h, 2),
                "date": d.date,
                "cost": d.cost,
                "label_x": round(x + bar_w / 2, 2),
                "is_today": i == len(daily) - 1,
            }
        )
    ticks = [
        {"y": chart_top, "label": _money(nice_max)},
        {"y": (chart_top + chart_bottom) / 2, "label": _money(nice_max / 2)},
        {"y": chart_bottom, "label": "$0"},
    ]
    return {
        "bars": bars,
        "width": width,
        "height": height,
        "max": nice_max,
        "ticks": ticks,
    }


def _nice_ceil(value: float) -> float:
    if value <= 0:
        return 1.0
    import math

    exp = math.floor(math.log10(value))
    base = 10 ** exp
    n = value / base
    if n <= 1:
        nice = 1
    elif n <= 2:
        nice = 2
    elif n <= 5:
        nice = 5
    else:
        nice = 10
    return nice * base


# Importable WSGI/ASGI entry point used by uvicorn ("tracebook.app:app").
app = create_app()
