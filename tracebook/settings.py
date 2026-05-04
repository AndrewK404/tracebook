import os
from pathlib import Path
from dataclasses import dataclass


@dataclass
class Settings:
    host: str
    port: int
    claude_projects: Path
    tracebook_home: Path

    @property
    def templates_dir(self) -> Path:
        return Path(__file__).parent / "templates"

    @property
    def static_dir(self) -> Path:
        return Path(__file__).parent / "static"


settings = Settings(
    host=os.environ.get("TRACEBOOK_HOST", "127.0.0.1"),
    port=int(os.environ.get("TRACEBOOK_PORT", "4178")),
    claude_projects=Path(
        os.environ.get("TRACEBOOK_CLAUDE_PROJECTS", "~/.claude/projects")
    ).expanduser(),
    tracebook_home=Path("~/.tracebook").expanduser(),
)
