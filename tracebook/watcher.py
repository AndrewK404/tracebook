import logging
from pathlib import Path

from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

from tracebook.settings import settings
from tracebook.store import store

log = logging.getLogger("tracebook.watcher")


class _Handler(FileSystemEventHandler):
    def on_created(self, event: FileSystemEvent) -> None:
        if not event.is_directory and str(event.src_path).endswith(".jsonl"):
            log.debug("new file: %s", event.src_path)
            store.invalidate(Path(event.src_path))

    def on_modified(self, event: FileSystemEvent) -> None:
        if not event.is_directory and str(event.src_path).endswith(".jsonl"):
            log.debug("modified: %s", event.src_path)
            store.invalidate(Path(event.src_path))


def start_watcher() -> Observer:
    observer = Observer()
    watched = 0
    seen: set[Path] = set()
    for _, path in settings.transcript_roots:
        if path in seen:
            continue
        seen.add(path)
        if path.exists():
            observer.schedule(_Handler(), str(path), recursive=True)
            log.info("watcher: watching %s", path)
            watched += 1
        else:
            log.warning("watcher: %s does not exist — not watched", path)
    if watched == 0:
        log.warning("watcher: no transcript paths exist — watcher started idle")
    observer.start()
    return observer
