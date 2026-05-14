from dataclasses import dataclass
from typing import Optional

# $ per 1 million tokens
@dataclass(frozen=True)
class ModelPrice:
    provider: str
    model: str
    input: float
    output: float
    cache_write: float
    cache_read: float
    notes: str = ""
    aliases: tuple[str, ...] = ()


PRICING: list[ModelPrice] = [
    # Anthropic Claude API. Prompt-cache write/read prices use the 5-minute
    # cache tier; 1-hour writes are 2x base input and are not represented here.
    ModelPrice("anthropic", "claude-opus-4-7",      5.00, 25.00,  6.25, 0.50),
    ModelPrice("anthropic", "claude-opus-4-6",      5.00, 25.00,  6.25, 0.50),
    ModelPrice("anthropic", "claude-opus-4-5",      5.00, 25.00,  6.25, 0.50),
    ModelPrice("anthropic", "claude-opus-4-1",     15.00, 75.00, 18.75, 1.50),
    ModelPrice("anthropic", "claude-opus-4",       15.00, 75.00, 18.75, 1.50),
    ModelPrice("anthropic", "claude-3-opus",       15.00, 75.00, 18.75, 1.50, notes="deprecated"),
    ModelPrice("anthropic", "claude-sonnet-4-6",    3.00, 15.00,  3.75, 0.30),
    ModelPrice("anthropic", "claude-sonnet-4-5",    3.00, 15.00,  3.75, 0.30),
    ModelPrice("anthropic", "claude-sonnet-4",      3.00, 15.00,  3.75, 0.30, notes="deprecated"),
    ModelPrice("anthropic", "claude-3-7-sonnet",    3.00, 15.00,  3.75, 0.30, notes="deprecated"),
    ModelPrice("anthropic", "claude-3-5-sonnet",    3.00, 15.00,  3.75, 0.30, notes="legacy"),
    ModelPrice("anthropic", "claude-haiku-4-5",     1.00,  5.00,  1.25, 0.10),
    ModelPrice("anthropic", "claude-3-5-haiku",     0.80,  4.00,  1.00, 0.08, notes="retired except Bedrock/Vertex"),
    ModelPrice("anthropic", "claude-3-haiku",       0.25,  1.25,  0.30, 0.03, notes="legacy"),

    # OpenAI API standard tier. OpenAI has no separate cache-write surcharge;
    # uncached input is billed at the input price and cached input at cache_read.
    ModelPrice("openai", "gpt-5.5",             5.00,  30.00,  5.00, 0.50),
    ModelPrice("openai", "gpt-5.5-long",       10.00,  45.00, 10.00, 1.00, notes="long context"),
    ModelPrice("openai", "gpt-5.5-pro",        30.00, 180.00, 30.00, 0.00),
    ModelPrice("openai", "gpt-5.5-pro-long",   60.00, 270.00, 60.00, 0.00, notes="long context"),
    ModelPrice("openai", "gpt-5.4",             2.50,  15.00,  2.50, 0.25),
    ModelPrice("openai", "gpt-5.4-long",        5.00,  22.50,  5.00, 0.50, notes="long context"),
    ModelPrice("openai", "gpt-5.4-mini",        0.75,   4.50,  0.75, 0.075),
    ModelPrice("openai", "gpt-5.4-nano",        0.20,   1.25,  0.20, 0.02),
    ModelPrice("openai", "gpt-5.4-pro",        30.00, 180.00, 30.00, 0.00),
    ModelPrice("openai", "gpt-5.4-pro-long",   60.00, 270.00, 60.00, 0.00, notes="long context"),
    ModelPrice("openai", "chat-latest",         5.00,  30.00,  5.00, 0.50, aliases=("gpt-5-chat-latest",)),
    ModelPrice("openai", "gpt-5.3-codex",       1.75,  14.00,  1.75, 0.175),
    ModelPrice("openai", "gpt-5.1-codex",       1.25, 10.00,  1.25, 0.125, aliases=("gpt-5-codex", "gpt-5.1-codex-max")),
    ModelPrice("openai", "gpt-5.1-codex-mini",  0.25,  2.00,  0.25, 0.025),
    ModelPrice("openai", "codex-mini-latest",   1.50,  6.00,  1.50, 0.375),
    ModelPrice("openai", "gpt-5",               1.25, 10.00,  1.25, 0.125, aliases=("gpt-5.1",)),
    ModelPrice("openai", "gpt-5-mini",          0.25,  2.00,  0.25, 0.025),
    ModelPrice("openai", "gpt-5-nano",          0.05,  0.40,  0.05, 0.005),
    ModelPrice("openai", "gpt-4.1",             2.00,  8.00,  2.00, 0.50),
    ModelPrice("openai", "gpt-4.1-mini",        0.40,  1.60,  0.40, 0.10),
    ModelPrice("openai", "gpt-4.1-nano",        0.10,  0.40,  0.10, 0.025),
    ModelPrice("openai", "gpt-4o",              2.50, 10.00,  2.50, 1.25),
    ModelPrice("openai", "gpt-4o-mini",         0.15,  0.60,  0.15, 0.075),
    ModelPrice("openai", "o3",                  2.00,  8.00,  2.00, 0.50),
    ModelPrice("openai", "o4-mini",             1.10,  4.40,  1.10, 0.275),
    ModelPrice("openai", "gpt-realtime-2-text",       4.00, 24.00, 4.00, 0.40, notes="text modality"),
    ModelPrice("openai", "gpt-realtime-2-audio",     32.00, 64.00, 32.00, 0.40, notes="audio modality"),
    ModelPrice("openai", "gpt-realtime-1-5-text",     4.00, 16.00, 4.00, 0.40, notes="text modality"),
    ModelPrice("openai", "gpt-realtime-1-5-audio",   32.00, 64.00, 32.00, 0.40, notes="audio modality"),
    ModelPrice("openai", "gpt-realtime-mini-text",    0.60,  2.40, 0.60, 0.06, notes="text modality"),
    ModelPrice("openai", "gpt-realtime-mini-audio",  10.00, 20.00, 10.00, 0.30, notes="audio modality"),
    ModelPrice("openai", "o3-deep-research",          5.00, 20.00, 5.00, 0.00, notes="specialized"),
    ModelPrice("openai", "o4-mini-deep-research",     1.00,  4.00, 1.00, 0.00, notes="specialized"),
    ModelPrice("openai", "computer-use-preview",      1.50,  6.00, 1.50, 0.00, notes="specialized"),

    # Google Gemini Developer API standard tier. Context-caching storage fees
    # are not included because transcripts only expose token counts.
    ModelPrice("google", "gemini-3.1-pro-preview",             2.00, 12.00, 2.00, 0.20, notes="standard <=200k", aliases=("gemini-3.1-pro-preview-customtools",)),
    ModelPrice("google", "gemini-3.1-pro-preview-long",        4.00, 18.00, 4.00, 0.40, notes="standard >200k"),
    ModelPrice("google", "gemini-3.1-flash-lite",              0.25,  1.50, 0.25, 0.025),
    ModelPrice("google", "gemini-3.1-flash-lite-preview",      0.25,  1.50, 0.25, 0.025),
    ModelPrice("google", "gemini-3.1-flash-live-preview",      0.75,  4.50, 0.75, 0.00, notes="text modality"),
    ModelPrice("google", "gemini-3.1-flash-image-preview",     0.50,  3.00, 0.50, 0.00, notes="text/thinking; image output priced separately"),
    ModelPrice("google", "gemini-3.1-flash-tts-preview",       1.00, 20.00, 1.00, 0.00, notes="TTS audio output"),
    ModelPrice("google", "gemini-3-flash-preview",             0.50,  3.00, 0.50, 0.05),
    ModelPrice("google", "gemini-3-pro-image-preview",         2.00, 12.00, 2.00, 0.00, notes="text/thinking; image output priced separately"),
    ModelPrice("google", "gemini-2.5-pro",                     1.25, 10.00, 1.25, 0.125, notes="standard <=200k"),
    ModelPrice("google", "gemini-2.5-pro-long",                2.50, 15.00, 2.50, 0.25, notes="standard >200k"),
    ModelPrice("google", "gemini-2.5-pro-preview-tts",         1.00, 20.00, 1.00, 0.00, notes="TTS audio output"),
    ModelPrice("google", "gemini-2.5-flash",                   0.30,  2.50, 0.30, 0.03),
    ModelPrice("google", "gemini-2.5-flash-native-audio-preview-12-2025", 0.50, 2.00, 0.50, 0.00, notes="Live API text modality"),
    ModelPrice("google", "gemini-2.5-flash-image",             0.30,  2.50, 0.30, 0.00, notes="text priced as 2.5 Flash; image output priced separately"),
    ModelPrice("google", "gemini-2.5-flash-preview-tts",       0.50, 10.00, 0.50, 0.00, notes="TTS audio output"),
    ModelPrice("google", "gemini-2.5-flash-lite",              0.10,  0.40, 0.10, 0.01),
    ModelPrice("google", "gemini-2.5-flash-lite-preview-09-2025", 0.10, 0.40, 0.10, 0.01),
    ModelPrice("google", "gemini-2.5-computer-use-preview-10-2025", 1.25, 10.00, 1.25, 0.00, notes="<=200k"),
    ModelPrice("google", "gemini-2.5-computer-use-preview-10-2025-long", 2.50, 15.00, 2.50, 0.00, notes=">200k"),
    ModelPrice("google", "gemini-2.0-flash",                   0.10,  0.40, 0.10, 0.025, notes="deprecated; shuts down 2026-06-01"),
    ModelPrice("google", "gemini-2.0-flash-lite",              0.075, 0.30, 0.075, 0.00, notes="deprecated; shuts down 2026-06-01"),
    ModelPrice("google", "gemini-robotics-er-1.6-preview",     1.00,  5.00, 1.00, 0.00),
]

_INDEX: dict[str, ModelPrice] = {}
for p in PRICING:
    _INDEX[p.model] = p
    for alias in p.aliases:
        _INDEX[alias] = p

# Fallback price for unknown models (sonnet-tier)
_FALLBACKS = {
    "anthropic": ModelPrice("anthropic", "unknown", 3.00, 15.00, 3.75, 0.30),
    "openai": ModelPrice("openai", "unknown", 1.25, 10.00, 1.25, 0.125),
    "google": ModelPrice("google", "unknown", 0.30, 2.50, 0.30, 0.03),
}


def provider_for_model(model: str) -> str:
    m = (model or "").lower()
    if "claude" in m or "opus" in m or "sonnet" in m or "haiku" in m:
        return "anthropic"
    if "gemini" in m:
        return "google"
    if "gpt" in m or "codex" in m or m.startswith(("o1", "o3", "o4")):
        return "openai"
    return "anthropic"


def price_for(model: str, provider: Optional[str] = None) -> ModelPrice:
    provider = provider or provider_for_model(model)
    if not model:
        return _FALLBACKS.get(provider, _FALLBACKS["anthropic"])
    m = model.lower()
    if m in _INDEX:
        return _INDEX[m]
    # partial-match: longest prefix wins
    best: Optional[ModelPrice] = None
    best_len = 0
    for key, p in _INDEX.items():
        if p.provider == provider and (m.startswith(key) or key.startswith(m)):
            if len(key) > best_len:
                best, best_len = p, len(key)
    return best or _FALLBACKS.get(provider, _FALLBACKS["anthropic"])


def compute_cost(
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_write_tokens: int = 0,
    cache_read_tokens: int = 0,
    provider: Optional[str] = None,
) -> float:
    p = price_for(model, provider)
    return (
        input_tokens * p.input
        + output_tokens * p.output
        + cache_write_tokens * p.cache_write
        + cache_read_tokens * p.cache_read
    ) / 1_000_000
