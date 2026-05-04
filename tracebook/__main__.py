import uvicorn
from tracebook.app import app
from tracebook.settings import settings
from tracebook.store import store
from tracebook.watcher import start_watcher
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)-5s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("tracebook")


def main() -> None:
    store.refresh()
    log.info("tracebook · http://%s:%d", settings.host, settings.port)
    log.info("watching %s · %d sessions indexed", settings.claude_projects, len(store.sessions))
    observer = start_watcher()
    try:
        uvicorn.run(
            app,
            host=settings.host,
            port=settings.port,
            log_level="warning",
        )
    finally:
        observer.stop()
        observer.join()


if __name__ == "__main__":
    main()
