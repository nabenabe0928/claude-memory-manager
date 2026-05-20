# Backend Overview

Flask API that reads from `~/.claude/projects/`. There is no database, and all state is on the filesystem.
The backend interacts with memory that is `.md` files with YAML frontmatter inside a project's `memory/` subdirectory (parsed with `python-frontmatter`) and with sessions that are `.jsonl` files in the project directory (Claude Code conversation transcripts).

## Source Structure

```
backend/
├── app.py              — Main Flask API. Single-file server with all routes and helpers.
├── tool_formatters.py  — Formatters for rendering tool inputs (Agent, Edit, Bash, AskUserQuestion) as readable text in session views.
├── pyproject.toml      — Project config (deps: Flask, flask-cors, python-frontmatter, ruff)
├── tests/
│   ├── __init__.py
│   ├── conftest.py      — Shared pytest fixtures (projects_dir, client)
│   ├── testing_utils.py — Helper to create test projects with memories/sessions
│   ├── test_helpers.py  — Unit tests for internal helper functions
│   └── test_api.py      — Integration tests for all API endpoints
```

## API Endpoint Design

| Method | Route | Description |
|---|---|---|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/<id>/counts` | Memory/session counts for a project |
| GET | `/api/projects/<id>/memories` | List memories for a project |
| DELETE | `/api/projects/<id>/memories/<filename>` | Delete a memory file (and update MEMORY.md index) |
| POST | `/api/projects/<id>/memories/batch-delete` | Batch delete memory files |
| GET | `/api/projects/<id>/sessions` | List sessions sorted by mtime descending |
| GET | `/api/projects/<id>/sessions/<sid>` | Get parsed session messages from JSONL |
| DELETE | `/api/projects/<id>/sessions/<sid>` | Delete a session file and its companion directory |
| POST | `/api/projects/<id>/sessions/batch-delete` | Batch delete sessions |
| DELETE | `/api/projects/<id>/sessions/<sid>/messages/<line_index>` | Delete a message with cascade (removes descendants) |
| POST | `/api/projects/<id>/sessions/<sid>/messages/batch-delete` | Batch delete messages with cascade |
| POST | `/api/projects/<id>/sessions/<sid>/duplicate` | Duplicate a session (file + companion dir) |
| GET | `/api/tree` | Hierarchical tree of projects under home directory |
