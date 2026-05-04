from dataclasses import dataclass
from typing import Optional

# $ per 1 million tokens
@dataclass(frozen=True)
class ModelPrice:
    model: str
    input: float
    output: float
    cache_write: float
    cache_read: float


PRICING: list[ModelPrice] = [
    ModelPrice("claude-opus-4-5",     15.00, 75.00, 18.75, 1.50),
    ModelPrice("claude-opus-4-6",     15.00, 75.00, 18.75, 1.50),
    ModelPrice("claude-opus-4-7",     15.00, 75.00, 18.75, 1.50),
    ModelPrice("claude-sonnet-4-5",    3.00, 15.00,  3.75, 0.30),
    ModelPrice("claude-sonnet-4-6",    3.00, 15.00,  3.75, 0.30),
    ModelPrice("claude-haiku-4-5",     1.00,  5.00,  1.25, 0.10),
    ModelPrice("claude-3-5-sonnet",    3.00, 15.00,  3.75, 0.30),
    ModelPrice("claude-3-5-haiku",     0.80,  4.00,  1.00, 0.08),
    ModelPrice("claude-3-opus",       15.00, 75.00, 18.75, 1.50),
    ModelPrice("gpt-4o",               5.00, 15.00,  2.50, 1.25),
    ModelPrice("gpt-4o-mini",          0.15,  0.60,  0.08, 0.075),
    ModelPrice("o3",                   2.00,  8.00,  1.00, 0.50),
    ModelPrice("o4-mini",              1.10,  4.40,  0.55, 0.275),
]

_INDEX: dict[str, ModelPrice] = {p.model: p for p in PRICING}

# Fallback price for unknown models (sonnet-tier)
_FALLBACK = ModelPrice("unknown", 3.00, 15.00, 3.75, 0.30)


def price_for(model: str) -> ModelPrice:
    if not model:
        return _FALLBACK
    m = model.lower()
    if m in _INDEX:
        return _INDEX[m]
    # partial-match: longest prefix wins
    best: Optional[ModelPrice] = None
    best_len = 0
    for key, p in _INDEX.items():
        if m.startswith(key) or key.startswith(m):
            if len(key) > best_len:
                best, best_len = p, len(key)
    return best or _FALLBACK


def compute_cost(
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_write_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> float:
    p = price_for(model)
    return (
        input_tokens * p.input
        + output_tokens * p.output
        + cache_write_tokens * p.cache_write
        + cache_read_tokens * p.cache_read
    ) / 1_000_000
