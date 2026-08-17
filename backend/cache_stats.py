"""Per-turn prompt-cache statistics and cache-miss attribution for session JSONL files.

Claude Code writes one JSONL line per content block, and every line of the same API
response repeats the identical usage object. Summing lines naively inflates the cache
counters, so records are deduped by `requestId` (falling back to `message.id`) and one
turn is emitted per distinct API request.

Subagents spawned by the Agent tool talk to the API on their own cache lifeline, and
their transcripts live in a companion directory next to the session file
(`<session-id>/subagents/agent-<id>.jsonl`). They are parsed with the same pipeline but
reported separately, so subagent traffic never distorts the main session's numbers.
"""

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path


_SYNTHETIC_MODEL = "<synthetic>"

_SUBAGENT_DIR_NAME = "subagents"
_AGENT_FILE_PREFIX = "agent-"
_AGENT_FILE_GLOB = f"{_AGENT_FILE_PREFIX}*.jsonl"
_AGENT_META_SUFFIX = ".meta.json"

_EPHEMERAL_1H_TTL_S = 3600
_EPHEMERAL_5M_TTL_S = 300

_CAUSE_SESSION_START = "session start"
_CAUSE_MODEL_SWITCH = "MODEL SWITCH"
_CAUSE_CC_UPGRADE = "CC UPGRADE"
_CAUSE_EFFORT_CHANGE = "EFFORT CHANGE"
_CAUSE_COMPACT = "COMPACT"
_CAUSE_TTL_EXPIRY = "TTL expiry"
_CAUSE_UNEXPLAINED = "unexplained"
_CAUSE_NO_MISS = "-"


@dataclass
class _Turn:
    """A single API request with its usage counters and inferred cache-miss cause.

    Attributes:
        timestamp: Raw ISO-8601 timestamp string as it appears in the record.
        at: Parsed timestamp used for sorting and gap computation.
        model: Model name, or None if absent from the record.
        effort: Reasoning-effort setting, or None if absent from the record.
        version: Claude Code version, or None if absent from the record.
        cache_read: Prompt tokens served from cache.
        cache_creation: Prompt tokens written to cache.
        uncached: Prompt tokens that were neither read from nor written to cache.
        output: Output tokens generated for this turn.
        ttl_s: The OBSERVED TTL of this turn's cache write, read from usage
            .cache_creation's ephemeral split (1h vs 5m). Not a configured value:
            it reflects whichever ephemeral bucket the API actually reported.
        after_compact: Whether this turn's parent record was a compact summary,
            i.e. this turn starts a fresh context after `/compact`.
        gap_s: Seconds since the previous turn; filled in by `_attribute`.
        hit_rate: Cache-read share of this turn's prompt; filled in by `_attribute`.
        cause: Inferred cache-miss cause for this turn; filled in by `_attribute`.
    """

    timestamp: str
    at: datetime
    model: str | None
    effort: str | None
    version: str | None
    cache_read: int
    cache_creation: int
    uncached: int
    output: int
    ttl_s: int
    after_compact: bool
    gap_s: float | None = None
    hit_rate: float | None = None
    cause: str = ""


def _hit_rate(cache_read: int, cache_creation: int) -> float | None:
    total = cache_read + cache_creation
    return cache_read / total if total else None


def _read_records(jsonl_file: Path) -> list[dict]:
    records: list[dict] = []
    with open(jsonl_file, encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return records


def _compact_parent_uuids(records: list[dict]) -> set[str]:
    """Collect the parents of compact summaries: their children start a fresh prefix."""
    parents: set[str] = set()
    for record in records:
        if record.get("type") != "user" or not record.get("isCompactSummary"):
            continue
        parent_uuid = record.get("parentUuid")
        if isinstance(parent_uuid, str):
            parents.add(parent_uuid)
    return parents


def _build_turn(record: dict, compact_parents: set[str]) -> _Turn | None:
    message = record.get("message") or {}
    usage = message.get("usage") or {}
    split = usage.get("cache_creation") or {}
    timestamp = record.get("timestamp")
    if not isinstance(timestamp, str):
        return None
    try:
        at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    return _Turn(
        timestamp=timestamp,
        at=at,
        model=message.get("model"),
        effort=record.get("effort"),
        version=record.get("version"),
        cache_read=usage.get("cache_read_input_tokens", 0),
        cache_creation=usage.get("cache_creation_input_tokens", 0),
        uncached=usage.get("input_tokens", 0),
        output=usage.get("output_tokens", 0),
        # Observed TTL, not inferred: the ephemeral splits always sum to cache_creation.
        ttl_s=(
            _EPHEMERAL_1H_TTL_S if split.get("ephemeral_1h_input_tokens") else _EPHEMERAL_5M_TTL_S
        ),
        after_compact=record.get("parentUuid") in compact_parents,
    )


def _load_turns(jsonl_file: Path, *, include_sidechain: bool = False) -> tuple[list[_Turn], int]:
    """Return one turn per API request, sorted by timestamp, plus the skipped count.

    Args:
        jsonl_file: Path to a session or subagent JSONL transcript.
        include_sidechain: Whether to keep `isSidechain` records. Session files may
            inline sidechain records that belong to a subagent, so they are dropped by
            default; a subagent file is entirely sidechain, so parsing one requires
            this to be True.

    Returns:
        The deduped turns in chronological order, and the count of records that looked
        like turns but could not be parsed into one.
    """
    records = _read_records(jsonl_file)
    compact_parents = _compact_parent_uuids(records)
    turns: list[_Turn] = []
    seen: set[str] = set()
    skipped = 0
    for record in records:
        if record.get("type") != "assistant":
            continue
        if record.get("isSidechain") and not include_sidechain:
            continue
        message = record.get("message") or {}
        # Synthetic records (interrupts, "No response requested.") carry a null
        # requestId and all-zero usage; keeping them fires a false MODEL SWITCH.
        if message.get("model") == _SYNTHETIC_MODEL:
            continue
        key = record.get("requestId") or message.get("id")
        if key is None:
            skipped += 1
            continue
        if key in seen:
            continue
        turn = _build_turn(record, compact_parents)
        if turn is None:
            skipped += 1
            continue
        seen.add(key)
        turns.append(turn)
    turns.sort(key=lambda t: t.at)
    return turns, skipped


def _infer_cause(turn: _Turn, previous: _Turn | None) -> str:
    if previous is None:
        return _CAUSE_SESSION_START
    if turn.model != previous.model:
        return _CAUSE_MODEL_SWITCH
    if turn.version != previous.version:
        return _CAUSE_CC_UPGRADE
    if turn.effort != previous.effort:
        return _CAUSE_EFFORT_CHANGE
    if turn.after_compact:
        return _CAUSE_COMPACT
    if turn.cache_creation <= turn.cache_read:
        return _CAUSE_NO_MISS
    # Compare the gap against the TTL the previous turn actually bought.
    if turn.gap_s is not None and turn.gap_s > previous.ttl_s:
        return _CAUSE_TTL_EXPIRY
    return _CAUSE_UNEXPLAINED


def _attribute(turns: list[_Turn]) -> None:
    """Fill in each turn's gap, hit rate, and inferred cache-miss cause, in place."""
    for i, turn in enumerate(turns):
        previous = turns[i - 1] if i else None
        turn.gap_s = (turn.at - previous.at).total_seconds() if previous else None
        turn.hit_rate = _hit_rate(turn.cache_read, turn.cache_creation)
        turn.cause = _infer_cause(turn, previous)


def _summarize(turns: list[_Turn]) -> dict:
    """Aggregate the per-turn counters into the session-level summary."""
    cache_read = sum(t.cache_read for t in turns)
    cache_creation = sum(t.cache_creation for t in turns)
    return {
        "turnCount": len(turns),
        "cacheRead": cache_read,
        "cacheCreation": cache_creation,
        "uncached": sum(t.uncached for t in turns),
        "output": sum(t.output for t in turns),
        "hitRate": _hit_rate(cache_read, cache_creation),
    }


def _serialize_turn(turn: _Turn) -> dict:
    return {
        "cacheRead": turn.cache_read,
        "cacheCreation": turn.cache_creation,
        "uncached": turn.uncached,
        "output": turn.output,
        "hitRate": turn.hit_rate,
        "gapS": turn.gap_s,
        "ttlS": turn.ttl_s,
        "model": turn.model,
        "cause": turn.cause,
        "timestamp": turn.timestamp,
    }


def _agent_files(jsonl_file: Path) -> list[Path]:
    """List the subagent transcripts of a session, oldest sessions yielding nothing."""
    subagent_dir = jsonl_file.parent / jsonl_file.stem / _SUBAGENT_DIR_NAME
    if not subagent_dir.is_dir():
        return []
    # The companion directory holds more than transcripts, hence the narrow glob.
    return sorted(subagent_dir.glob(_AGENT_FILE_GLOB))


def _as_label(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _read_agent_labels(agent_file: Path) -> tuple[str | None, str | None]:
    """Read `agentType` and `description` from the sibling meta file.

    Labels are cosmetic, so every failure mode (no meta file, unreadable, malformed
    JSON, missing or non-string field) degrades to None rather than raising.
    """
    meta_file = agent_file.parent / f"{agent_file.stem}{_AGENT_META_SUFFIX}"
    try:
        meta = json.loads(meta_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None, None
    if not isinstance(meta, dict):
        return None, None
    return _as_label(meta.get("agentType")), _as_label(meta.get("description"))


def _build_agent_stats(agent_file: Path, turns: list[_Turn], skipped: int) -> dict:
    agent_type, description = _read_agent_labels(agent_file)
    return {
        "agentId": agent_file.stem.removeprefix(_AGENT_FILE_PREFIX),
        "agentType": agent_type,
        "description": description,
        "turns": [_serialize_turn(t) for t in turns],
        "session": _summarize(turns),
        "skipped": skipped,
    }


def _build_subagents(jsonl_file: Path) -> list[dict]:
    """Build one independent stats block per subagent, ordered by first turn."""
    ranked: list[tuple[bool, float, dict]] = []
    for agent_file in _agent_files(jsonl_file):
        # A subagent file is entirely sidechain, and it is its own cache lifeline: its
        # turns are attributed on their own, never merged into the session's.
        turns, skipped = _load_turns(agent_file, include_sidechain=True)
        _attribute(turns)
        # An agent with no turns has no timestamp to order by, so it sorts last.
        started_at = turns[0].at.timestamp() if turns else 0.0
        ranked.append((not turns, started_at, _build_agent_stats(agent_file, turns, skipped)))
    # Sorting on the key alone keeps ties in the filename order `_agent_files` returned.
    return [stats for *_, stats in sorted(ranked, key=lambda r: r[:2])]


def build_cache_stats(jsonl_file: Path) -> dict:
    """Build the JSON payload of per-turn and session-level cache statistics.

    Args:
        jsonl_file: Path to a session's JSONL transcript.

    Returns:
        A dict with four keys:
            turns: One camelCase dict per deduped API request (see
                `_serialize_turn`), in chronological order.
            session: Session-level aggregate counters (see `_summarize`).
            skipped: Count of records that could not be turned into a turn
                (missing request/message id, or an unparseable timestamp).
            subagents: One block per subagent transcript found in the session's
                companion directory, empty when there is none. Each block carries
                the same `turns` / `session` / `skipped` shape as the main session
                plus three labels: `agentId` (the `agent-<id>.jsonl` stem without
                its `agent-` prefix) and `agentType` / `description`, which are None
                whenever the sibling meta file is missing or unusable. Blocks are
                ordered by first turn, with turn-less agents last, and their counters
                are never folded into the session-level numbers above.
    """
    turns, skipped = _load_turns(jsonl_file)
    _attribute(turns)
    return {
        "turns": [_serialize_turn(t) for t in turns],
        "session": _summarize(turns),
        "skipped": skipped,
        "subagents": _build_subagents(jsonl_file),
    }
