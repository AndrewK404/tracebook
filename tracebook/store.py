"""
In-memory session index.  Read-only.  Invalidated by the FS watcher.
"""
from __future__ import annotations

import threading
import time
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
        self._known_paths: set[Path] = set()
        self._dirty_paths: set[Path] = set()
        self._last_full_scan = 0.0
        # Small periodic full-resync catches deletions and any file-system edge cases.
        self._full_scan_interval_sec = 60

    # ── public API ────────────────────────────────────────────────────────────

    @property
    def sessions(self) -> dict[str, Session]:
        return self._sessions

    def _iter_session_paths(self, kind: str, configured_root: Path) -> set[Path]:
        paths: set[Path] = set()
        for root in _transcript_scan_roots(kind, configured_root):
            if not root.exists():
                continue
            for jsonl in root.rglob("*.jsonl"):
                if kind == "claude" and "subagents" in jsonl.parts:
                    continue
                paths.add(jsonl)
        return paths

    def _paths_for_kind(self, path: Path) -> list[str]:
        found: list[str] = []
        for kind, configured_root in settings.transcript_roots:
            for root in _transcript_scan_roots(kind, configured_root):
                if path.is_relative_to(root):
                    found.append(kind)
                    break
        return found

    def refresh(self) -> None:
        """Walk configured transcript roots and parse all new/changed JSONL files."""
        parsers = {
            "claude": lambda path: parse_claude_session(path, include_trace=False, include_transcript=False),
            "codex": lambda path: parse_codex_session(path, include_trace=False, include_transcript=False),
        }

        seen_paths: set[Path] = set()
        now = time.monotonic()
        need_full_scan = not self._known_paths or (now - self._last_full_scan) > self._full_scan_interval_sec
        with self._lock:
            if not need_full_scan and not self._dirty_paths:
                return

            changed = set(self._dirty_paths)
            self._dirty_paths.clear()
            targets_by_kind: dict[str, set[Path]] = {"claude": set(), "codex": set()}

            # Full scan keeps the index safe against deletions and long-running
            # process edge cases.
            if need_full_scan:
                for kind, configured_root in settings.transcript_roots:
                    targets_by_kind[kind].update(self._iter_session_paths(kind, configured_root))
            else:
                for jsonl in changed:
                    if not jsonl.suffix == ".jsonl":
                        continue
                    for kind in self._paths_for_kind(jsonl):
                        targets_by_kind[kind].add(jsonl)

            if not any(targets_by_kind.values()):
                self._last_full_scan = now
                return

            for kind, parser in parsers.items():
                for jsonl in targets_by_kind[kind]:
                    if kind == "claude" and "subagents" in jsonl.parts:
                        continue
                    try:
                        mtime = jsonl.stat().st_mtime
                    except OSError:
                        self._sessions.pop(self._path_ids.pop(jsonl, ""), None)
                        self._mtimes.pop(jsonl, None)
                        self._known_paths.discard(jsonl)
                        continue
                    if self._mtimes.get(jsonl) == mtime and need_full_scan is False:
                        continue  # unchanged and unchanged set target from watcher
                    sess = parser(jsonl)
                    if sess:
                        previous_id = self._path_ids.get(jsonl)
                        if previous_id and previous_id != sess.id:
                            self._sessions.pop(previous_id, None)
                        self._sessions[sess.id] = sess
                        self._mtimes[jsonl] = mtime
                        self._path_ids[jsonl] = sess.id
                        self._known_paths.add(jsonl)
                    seen_paths.add(jsonl)

            seen_paths.update(path for paths in targets_by_kind.values() for path in paths)
            # remove stale sessions on periodic full scans, so missed deletions are caught.
            if need_full_scan:
                for p in set(self._known_paths) - seen_paths:
                    sid = self._path_ids.pop(p, None)
                    if sid:
                        self._sessions.pop(sid, None)
                    self._mtimes.pop(p, None)
                    self._known_paths.discard(p)

            self._known_paths.update(seen_paths)
            self._last_full_scan = now

    def invalidate(self, path: Path) -> None:
        """Called by the watcher on file create/modify."""
        normalized = path
        try:
            normalized = path.resolve()
        except OSError:
            normalized = path
        with self._lock:
            self._mtimes.pop(normalized, None)
            self._dirty_paths.add(normalized)
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
