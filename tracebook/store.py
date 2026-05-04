"""In-memory session index, populated lazily and invalidated by the watcher."""

from __future__ import annotations

import threading
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from tracebook.parsers.claude import Session, parse_session
from tracebook.settings import (
    CLAUDE_PROJECTS_DIR,
    LIVE_WINDOW_SECONDS,
    load_pricing,
)


@dataclass
class Kpis:
    sessions_total: int
    sessions_today: int
    turns_total: int
    cost_today: float
    cost_total: float
    live_count: int
    last_activity: datetime | None


@dataclass
class ProjectChip:
    cwd: str
    name: str
    session_count: int


@dataclass
class PromptCost:
    cost: float
    prompt: str
    session_id: str
    session_short: str
    tokens: int
    when: datetime | None


@dataclass
class DailyCost:
    date: str  # YYYY-MM-DD
    cost: float


# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_lock = threading.RLock()
_cache: dict[Path, tuple[float, Session]] = {}  # path → (mtime, session)
_pricing = load_pricing()


def reload_pricing() -> None:
    global _pricing
    with _lock:
        _pricing = load_pricing()


def invalidate(path: Path | None = None) -> None:
    """Drop a single file or the whole cache."""
    with _lock:
        if path is None:
            _cache.clear()
        else:
            _cache.pop(path, None)


def _scan_paths() -> list[Path]:
    if not CLAUDE_PROJECTS_DIR.exists():
        return []
    return sorted(CLAUDE_PROJECTS_DIR.rglob("*.jsonl"))


def _ensure_session(path: Path) -> Session | None:
    """Parse `path` if missing or stale; return cached entry otherwise."""
    try:
        mtime = path.stat().st_mtime
    except FileNotFoundError:
        invalidate(path)
        return None
    cached = _cache.get(path)
    if cached and cached[0] == mtime:
        return cached[1]
    try:
        session = parse_session(path, _pricing, live_threshold_seconds=LIVE_WINDOW_SECONDS)
    except Exception:  # pragma: no cover — defensive against malformed files
        return None
    _cache[path] = (mtime, session)
    return session


def list_sessions() -> list[Session]:
    """All known sessions, newest activity first."""
    with _lock:
        sessions: list[Session] = []
        for path in _scan_paths():
            sess = _ensure_session(path)
            if sess is None:
                continue
            # Skip empty / housekeeping-only transcripts.
            if not sess.turns:
                continue
            sessions.append(sess)
    sessions.sort(
        key=lambda s: s.last_activity_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return sessions


def get_session(session_id: str) -> Session:
    """Look up a session by id (UUID stem). Raises LookupError on miss."""
    with _lock:
        for path in _scan_paths():
            if path.stem == session_id:
                sess = _ensure_session(path)
                if sess:
                    return sess
                break
    raise LookupError(session_id)


def get_kpis() -> Kpis:
    sessions = list_sessions()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_sessions = [s for s in sessions if s.last_activity_at and s.last_activity_at >= today_start]
    return Kpis(
        sessions_total=len(sessions),
        sessions_today=len(today_sessions),
        turns_total=sum(len(s.turns) for s in sessions),
        cost_today=sum(s.total_cost_usd for s in today_sessions),
        cost_total=sum(s.total_cost_usd for s in sessions),
        live_count=sum(1 for s in sessions if s.is_live),
        last_activity=max((s.last_activity_at for s in sessions if s.last_activity_at), default=None),
    )


def get_projects(limit: int = 12) -> list[ProjectChip]:
    sessions = list_sessions()
    counts: dict[str, int] = defaultdict(int)
    for s in sessions:
        counts[s.cwd] += 1
    chips = [
        ProjectChip(cwd=cwd, name=cwd.rsplit("/", 1)[-1] or cwd, session_count=n)
        for cwd, n in counts.items()
    ]
    chips.sort(key=lambda c: c.session_count, reverse=True)
    return chips[:limit]


def top_prompts(window: str = "today", limit: int = 5) -> list[PromptCost]:
    """Return the N most expensive user prompts in the window.

    A "prompt" here is the cost of all assistant turns that follow a given
    user prompt, until the next user prompt.
    """
    sessions = list_sessions()
    cutoff = _window_cutoff(window)

    rows: list[PromptCost] = []
    for sess in sessions:
        current_prompt: str | None = None
        current_when: datetime | None = None
        cost_accum = 0.0
        token_accum = 0

        def flush() -> None:
            nonlocal cost_accum, token_accum, current_prompt, current_when
            if current_prompt and cost_accum > 0:
                if cutoff is None or (current_when and current_when >= cutoff):
                    rows.append(
                        PromptCost(
                            cost=cost_accum,
                            prompt=current_prompt,
                            session_id=sess.id,
                            session_short=sess.short_id,
                            tokens=token_accum,
                            when=current_when,
                        )
                    )
            cost_accum = 0.0
            token_accum = 0

        for turn in sess.turns:
            if turn.kind == "user" and turn.text:
                flush()
                current_prompt = turn.text
                current_when = turn.timestamp
            elif turn.kind == "assistant":
                cost_accum += turn.cost_usd
                if turn.usage:
                    token_accum += turn.usage.total
        flush()

    rows.sort(key=lambda r: r.cost, reverse=True)
    return rows[:limit]


def daily_cost_series(days: int = 14) -> list[DailyCost]:
    sessions = list_sessions()
    today = datetime.now(timezone.utc).date()
    buckets: dict[str, float] = {}
    for offset in range(days):
        d = today - timedelta(days=days - 1 - offset)
        buckets[d.isoformat()] = 0.0

    for sess in sessions:
        for turn in sess.turns:
            if turn.kind != "assistant" or turn.cost_usd <= 0 or not turn.timestamp:
                continue
            day = turn.timestamp.date().isoformat()
            if day in buckets:
                buckets[day] += turn.cost_usd

    return [DailyCost(date=d, cost=c) for d, c in buckets.items()]


def _window_cutoff(window: str) -> datetime | None:
    now = datetime.now(timezone.utc)
    if window == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if window == "week":
        return now - timedelta(days=7)
    if window == "all":
        return None
    return now.replace(hour=0, minute=0, second=0, microsecond=0)
