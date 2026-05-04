"""Filesystem watcher — invalidates the store cache when JSONLs change."""

from __future__ import annotations

import logging
import threading
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer
from watchdog.observers.polling import PollingObserver

from tracebook import store
from tracebook.settings import CLAUDE_PROJECTS_DIR

log = logging.getLogger("tracebook.watcher")


class _JsonlHandler(FileSystemEventHandler):
    """Invalidate store entries on .jsonl create/modify/delete."""

    def __init__(self) -> None:
        self._timer: threading.Timer | None = None
        self._dirty: set[Path] = set()
        self._lock = threading.Lock()

    def _enqueue(self, path: Path) -> None:
        if path.suffix != ".jsonl":
            return
        with self._lock:
            self._dirty.add(path)
            if self._timer is None or not self._timer.is_alive():
                self._timer = threading.Timer(0.2, self._flush)
                self._timer.daemon = True
                self._timer.start()

    def _flush(self) -> None:
        with self._lock:
            paths = list(self._dirty)
            self._dirty.clear()
        for p in paths:
            store.invalidate(p)

    # --- watchdog hooks -----------------------------------------------------

    def on_created(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._enqueue(Path(event.src_path))

    def on_modified(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._enqueue(Path(event.src_path))

    def on_deleted(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._enqueue(Path(event.src_path))

    def on_moved(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._enqueue(Path(event.src_path))
            dest = getattr(event, "dest_path", None)
            if dest:
                self._enqueue(Path(dest))


def start_watcher() -> Observer | PollingObserver | None:
    """Spawn an observer for `~/.claude/projects/`. Returns the running observer."""
    target = CLAUDE_PROJECTS_DIR
    if not target.exists():
        log.info("watcher: %s does not exist yet — skipping", target)
        return None

    handler = _JsonlHandler()
    observer: Observer | PollingObserver
    try:
        observer = Observer()
        observer.schedule(handler, str(target), recursive=True)
        observer.start()
    except Exception:  # pragma: no cover — fall back to polling
        log.warning("watcher: native observer failed, falling back to polling")
        observer = PollingObserver(timeout=2.0)
        observer.schedule(handler, str(target), recursive=True)
        observer.start()

    log.info("watcher: watching %s", target)
    return observer
