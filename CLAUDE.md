# Claude Memory Manager

A web app for browsing and managing Claude Code's per-project memory files and session logs stored in `~/.claude/projects/`.
View, inspect, and delete memories and session transcripts across all your projects.

# General Rules
- Do not check PEP 8, line length, and import ordering, and type hints manually because they are enforced by `formats.sh`.
    - `formats.sh` is trigered automatically by `hooks`.
- See `backend/claude_memos/overview.md` or `frontend/overview.md` when you work on `backend/` or `frontend/`, respectively.
- Use `bash start.sh` to start the app.
