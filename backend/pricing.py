"""User-maintained USD pricing table for Claude API token usage.

Anthropic's per-model pricing changes too often to hardcode, so rates are kept in a
JSON file the user edits through the UI. The file lives in the repo root and is
tracked in git, so rates are shared across clones instead of being per-machine.
"""

import json
from pathlib import Path


_PRICING_FILE = Path(__file__).resolve().parent.parent / "pricing.json"

_RATE_FIELDS = (
    "baseInputRate",
    "fiveMinWriteRate",
    "oneHourWriteRate",
    "cacheReadRate",
    "outputRate",
)


def load_pricing() -> dict[str, dict[str, float]]:
    """Load the pricing table, degrading to `{}` on any missing/invalid file."""
    try:
        data = json.loads(_PRICING_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def save_model_pricing(model: str, rates: dict) -> dict[str, dict[str, float]]:
    """Set one model's rates (USD per 1,000,000 tokens) and persist the full table.

    Args:
        model: Model name to key the entry by.
        rates: Rate fields to store; missing fields default to 0.0 and unknown
            fields are ignored.

    Returns:
        The full updated pricing dict, as also written to disk.
    """
    pricing = load_pricing()
    pricing[model] = {field: float(rates.get(field, 0.0)) for field in _RATE_FIELDS}
    _PRICING_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PRICING_FILE.write_text(json.dumps(pricing, indent=2) + "\n", encoding="utf-8")
    return pricing
