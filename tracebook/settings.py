import os
import json
from pathlib import Path
from dataclasses import dataclass
from typing import Any


@dataclass
class Settings:
    host: str
    port: int
    claude_projects: Path
    codex_sessions: Path
    tracebook_home: Path
    codex_archive_sessions_override: Path | None = None

    @property
    def templates_dir(self) -> Path:
        return Path(__file__).parent / "templates"

    @property
    def static_dir(self) -> Path:
        return Path(__file__).parent / "static"

    @property
    def codex_archive_sessions(self) -> Path:
        if self.codex_archive_sessions_override:
            return self.codex_archive_sessions_override
        return self.codex_sessions.parent / "archived_sessions"

    @property
    def transcript_roots(self) -> list[tuple[str, Path]]:
        roots: list[tuple[str, Path]] = [
            ("claude", self.claude_projects),
            ("codex", self.codex_sessions),
        ]
        archive = self.codex_archive_sessions
        if archive != self.codex_sessions:
            roots.append(("codex", archive))
        return roots

    def update_trace_paths(self, data: dict[str, Any]) -> None:
        if "claude_projects" in data:
            self.claude_projects = Path(str(data["claude_projects"])).expanduser()
        if "codex_sessions" in data:
            self.codex_sessions = Path(str(data["codex_sessions"])).expanduser()
        if "codex_archive_sessions" in data:
            value = str(data["codex_archive_sessions"] or "").strip()
            self.codex_archive_sessions_override = Path(value).expanduser() if value else None
        _save_user_config({
            "claude_projects": str(self.claude_projects),
            "codex_sessions": str(self.codex_sessions),
            "codex_archive_sessions": str(self.codex_archive_sessions_override) if self.codex_archive_sessions_override else "",
        })


def _config_path() -> Path:
    return Path(os.environ.get("TRACEBOOK_CONFIG", "~/.tracebook/settings.json")).expanduser()


def _load_user_config() -> dict[str, Any]:
    path = _config_path()
    try:
        if path.exists():
            data = json.loads(path.read_text())
            if isinstance(data, dict):
                return data
    except (OSError, json.JSONDecodeError):
        return {}
    return {}


def _save_user_config(data: dict[str, Any]) -> None:
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = _load_user_config()
    existing.update(data)
    path.write_text(json.dumps(existing, indent=2, sort_keys=True) + "\n")


_user_config = _load_user_config()


def _path_setting(key: str, env_name: str, default: str) -> Path:
    return Path(os.environ.get(env_name, _user_config.get(key, default))).expanduser()


settings = Settings(
    host=os.environ.get("TRACEBOOK_HOST", "127.0.0.1"),
    port=int(os.environ.get("TRACEBOOK_PORT", "4178")),
    claude_projects=_path_setting("claude_projects", "TRACEBOOK_CLAUDE_PROJECTS", "~/.claude/projects"),
    codex_sessions=_path_setting("codex_sessions", "TRACEBOOK_CODEX_SESSIONS", "~/.codex/sessions"),
    tracebook_home=Path("~/.tracebook").expanduser(),
    codex_archive_sessions_override=(
        Path(str(_user_config["codex_archive_sessions"])).expanduser()
        if _user_config.get("codex_archive_sessions")
        else None
    ),
)
