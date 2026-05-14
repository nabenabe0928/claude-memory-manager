"""Shared test utilities for backend tests."""
import json


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
