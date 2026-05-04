"""Centralized paths, ports, and pricing constants.

All filesystem locations and external knobs live here so the rest of the
codebase can stay free of magic strings.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Final


HOME: Final[Path] = Path.home()

CLAUDE_PROJECTS_DIR: Final[Path] = HOME / ".claude" / "projects"
TRACEBOOK_HOME: Final[Path] = HOME / ".tracebook"
PRICING_FILE: Final[Path] = TRACEBOOK_HOME / "pricing.json"

HOST: Final[str] = os.environ.get("TRACEBOOK_HOST", "127.0.0.1")
PORT: Final[int] = int(os.environ.get("TRACEBOOK_PORT", "4178"))
LIVE_WINDOW_SECONDS: Final[int] = 60


@dataclass(frozen=True)
class ModelPricing:
    """Cost in USD per million tokens for a single model."""

    input_per_mtok: float
    output_per_mtok: float
    cache_read_per_mtok: float
    cache_write_per_mtok: float


# Default Claude pricing (USD / MTok). User can override via PRICING_FILE.
# Numbers reflect public Anthropic API pricing.
DEFAULT_PRICING: dict[str, ModelPricing] = {
    "claude-opus-4-7": ModelPricing(15.0, 75.0, 1.5, 18.75),
    "claude-opus-4-6": ModelPricing(15.0, 75.0, 1.5, 18.75),
    "claude-opus-4": ModelPricing(15.0, 75.0, 1.5, 18.75),
    "claude-sonnet-4-6": ModelPricing(3.0, 15.0, 0.3, 3.75),
    "claude-sonnet-4-5": ModelPricing(3.0, 15.0, 0.3, 3.75),
    "claude-sonnet-4": ModelPricing(3.0, 15.0, 0.3, 3.75),
    "claude-haiku-4-5": ModelPricing(0.8, 4.0, 0.08, 1.0),
    "claude-haiku-4": ModelPricing(0.8, 4.0, 0.08, 1.0),
}

# Fallback when the model id isn't in the table — mid-tier defaults so
# numbers are within an order of magnitude rather than zero.
FALLBACK_PRICING: ModelPricing = ModelPricing(3.0, 15.0, 0.3, 3.75)


def load_pricing() -> dict[str, ModelPricing]:
    """Return the bundled pricing table merged with any user override."""
    pricing = dict(DEFAULT_PRICING)
    if PRICING_FILE.exists():
        try:
            raw = json.loads(PRICING_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return pricing
        for model_id, entry in raw.items():
            try:
                pricing[model_id] = ModelPricing(
                    input_per_mtok=float(entry["input_per_mtok"]),
                    output_per_mtok=float(entry["output_per_mtok"]),
                    cache_read_per_mtok=float(entry["cache_read_per_mtok"]),
                    cache_write_per_mtok=float(entry["cache_write_per_mtok"]),
                )
            except (KeyError, TypeError, ValueError):
                continue
    return pricing


def price_for(model: str | None, pricing: dict[str, ModelPricing]) -> ModelPricing:
    """Return the pricing entry for `model`, falling back gracefully."""
    if not model:
        return FALLBACK_PRICING
    if model in pricing:
        return pricing[model]
    # Best-effort partial match: e.g. "claude-sonnet-4-6-20250101" → "claude-sonnet-4-6".
    for key in pricing:
        if model.startswith(key):
            return pricing[key]
    return FALLBACK_PRICING
