"""
In-memory session index.  Read-only.  Invalidated by the FS watcher.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Optional

from tracebook.parsers.claude import Session, parse_session as parse_claude_session
from tracebook.parsers.codex import parse_session as parse_codex_session
from tracebook.settings import settings


def _transcript_scan_roots(kind: str, root: Path) -> list[Path]:
    if kind == "codex" and root.name == ".codex":
        return [root / "sessions", root / "archived_sessions"]
    return [root]


class Store:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        # session_id → Session
        self._sessions: dict[str, Session] = {}
        # path → mtime (for invalidation)
        self._mtimes: dict[Path, float] = {}
        self._path_ids: dict[Path, str] = {}

    # ── public API ────────────────────────────────────────────────────────────

    @property
    def sessions(self) -> dict[str, Session]:
        return self._sessions

    def refresh(self) -> None:
        """Walk configured transcript roots and parse all new/changed JSONL files."""
        parsers = {
            "claude": parse_claude_session,
            "codex": lambda path: parse_codex_session(path, include_trace=True),
        }

        seen_paths: set[Path] = set()
        with self._lock:
            for kind, configured_root in settings.transcript_roots:
                parser = parsers[kind]
                for root in _transcript_scan_roots(kind, configured_root):
                    if not root.exists():
                        continue
                    for jsonl in sorted(root.rglob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True):
                        if kind == "claude" and "subagents" in jsonl.parts:
                            continue
                        seen_paths.add(jsonl)
                        try:
                            mtime = jsonl.stat().st_mtime
                        except OSError:
                            continue
                        if self._mtimes.get(jsonl) == mtime:
                            continue  # unchanged
                        sess = parser(jsonl)
                        if sess:
                            previous_id = self._path_ids.get(jsonl)
                            if previous_id and previous_id != sess.id:
                                self._sessions.pop(previous_id, None)
                            self._sessions[sess.id] = sess
                            self._mtimes[jsonl] = mtime
                            self._path_ids[jsonl] = sess.id

            # remove sessions whose files are gone
            gone = set(self._mtimes) - seen_paths
            for p in gone:
                sid = self._path_ids.pop(p, None)
                if sid:
                    self._sessions.pop(sid, None)
                self._mtimes.pop(p, None)

    def invalidate(self, path: Path) -> None:
        """Called by the watcher on file create/modify."""
        with self._lock:
            self._mtimes.pop(path, None)
        self.refresh()

    def list_sessions(self) -> list[Session]:
        """Return all sessions, newest first."""
        with self._lock:
            return sorted(
                self._sessions.values(),
                key=lambda s: s.last_at or s.started_at or __import__("datetime").datetime.min.replace(tzinfo=__import__("datetime").timezone.utc),
                reverse=True,
            )

    def get_session(self, session_id: str) -> Optional[Session]:
        with self._lock:
            # exact match
            if session_id in self._sessions:
                return self._sessions[session_id]
            # short match
            for sess in self._sessions.values():
                if sess.short == session_id or sess.id.startswith(session_id):
                    return sess
            return None


store = Store()
