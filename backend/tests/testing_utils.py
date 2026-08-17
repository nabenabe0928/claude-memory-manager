"""Shared test utilities for backend tests."""

import json


CACHE_USAGE_5M = {
    "cache_read_input_tokens": 100,
    "cache_creation_input_tokens": 10,
    "cache_creation": {"ephemeral_5m_input_tokens": 10},
}


def make_assistant_record(
    request_id,
    message_id,
    *,
    timestamp="2026-08-17T00:00:00Z",
    model="claude-opus-5",
    version="2.1.220",
    usage=None,
    effort=None,
    parent_uuid=None,
    is_sidechain=False,
):
    """Build one raw assistant JSONL record in the shape Claude Code writes.

    Claude Code emits one line per content block, so several records may share the same
    request_id / message_id; the cache stats loader is expected to dedupe them.
    """
    return {
        "type": "assistant",
        "requestId": request_id,
        "timestamp": timestamp,
        "version": version,
        "effort": effort,
        "parentUuid": parent_uuid,
        "isSidechain": is_sidechain,
        "message": {
            "id": message_id,
            "model": model,
            "usage": CACHE_USAGE_5M if usage is None else usage,
        },
    }


def create_project(projects_dir, dirname, memories=None, sessions=None):
    """Create a project directory with optional memory files and session files.

    Args:
        projects_dir: The base projects directory.
        dirname: The project directory name.
        memories: A dict mapping filename to content string (frontmatter markdown).
        sessions: A dict mapping session_id to a list of message dicts (written as JSONL).

    Returns:
        The Path to the created project directory.
    """
    project_dir = projects_dir / dirname
    project_dir.mkdir()

    if memories:
        memory_dir = project_dir / "memory"
        memory_dir.mkdir(exist_ok=True)
        for filename, content in memories.items():
            (memory_dir / filename).write_text(content)

    if sessions:
        for session_id, messages in sessions.items():
            jsonl_file = project_dir / f"{session_id}.jsonl"
            lines = [json.dumps(msg) for msg in messages]
            jsonl_file.write_text("\n".join(lines) + "\n")

    return project_dir


def create_subagent(project_dir, session_id, agent_id, records, meta=None):
    """Write one subagent transcript into a session's companion directory.

    Args:
        project_dir: The project directory holding `<session_id>.jsonl`.
        session_id: The session that spawned the agent.
        agent_id: The agent's id, used as `agent-<agent_id>.jsonl`.
        records: Raw JSONL records; every one of them is written as sidechain, the way
            Claude Code writes subagent transcripts.
        meta: Object written to the sibling `agent-<agent_id>.meta.json`, or None to
            leave the meta file out. A string is written verbatim so tests can produce a
            malformed one; anything else is JSON-encoded.

    Returns:
        The Path to the created agent JSONL file.
    """
    subagent_dir = project_dir / session_id / "subagents"
    subagent_dir.mkdir(parents=True, exist_ok=True)

    jsonl_file = subagent_dir / f"agent-{agent_id}.jsonl"
    lines = [json.dumps({**record, "isSidechain": True}) for record in records]
    jsonl_file.write_text("".join(f"{line}\n" for line in lines))

    if meta is not None:
        meta_file = subagent_dir / f"agent-{agent_id}.meta.json"
        meta_file.write_text(meta if isinstance(meta, str) else json.dumps(meta))

    return jsonl_file
