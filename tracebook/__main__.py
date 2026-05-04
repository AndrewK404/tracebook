"""`uv run tracebook` — start the local dashboard."""

from __future__ import annotations

import argparse
import logging

import uvicorn

from tracebook import __version__
from tracebook.settings import HOST, PORT


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="tracebook",
        description="Local dashboard for Claude Code session transcripts.",
    )
    parser.add_argument("--host", default=HOST, help=f"bind host (default: {HOST})")
    parser.add_argument("--port", type=int, default=PORT, help=f"bind port (default: {PORT})")
    parser.add_argument("--reload", action="store_true", help="hot-reload on code changes (dev)")
    parser.add_argument(
        "--version",
        action="version",
        version=f"tracebook {__version__}",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s  %(message)s",
        datefmt="%H:%M:%S",
    )
    print(f"tracebook · http://{args.host}:{args.port}")
    uvicorn.run(
        "tracebook.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
