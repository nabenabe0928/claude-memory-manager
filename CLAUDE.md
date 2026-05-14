# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> [!TIPS]
> If you need to understand the project structure, please read [project-structure.md](project-structure.md).

## Subagent Policy

If the user query relates to the following, use one of the following subagents:
- [Refactoring for Backend](.claude/agents/python-style.md)
- [Test Creator for Backend](.claude/agents/python-test.md)
- [Refactoring for Frontend](.claude/agents/ts-style.md)
- [Test Creator for Frontend](.claude/agents/ts-test.md)

## What This Project Is

Claude Memory Manager is a web app for browsing and managing Claude Code's per-project memory files and session logs stored in `~/.claude/projects/`. It lets you view, inspect, and delete memories and session transcripts across all projects.

## Development

### Running the App

```bash
./start.sh          # starts backend + frontend in a tmux session
```

- Frontend: http://localhost:5173 (Vite dev server, proxies `/api` to backend)
- Backend: http://localhost:5001 (Flask)

### Backend (Python / Flask)

```bash
cd backend
uv run app.py
```

Dependencies are declared in `backend/pyproject.toml`. Uses `uv` as the package manager.

### Frontend (React / TypeScript / Vite)

```bash
cd frontend
npm install
npm run dev          # dev server with HMR
npm run build        # tsc -b && vite build
npm run lint         # eslint
```

## Architecture

**Backend** (`backend/app.py`) — single-file Flask API that reads from `~/.claude/projects/`. All state is on the filesystem; there is no database.

- Projects = directories under `~/.claude/projects/`
- Memories = `.md` files with YAML frontmatter inside a project's `memory/` subdirectory (parsed with `python-frontmatter`)
- Sessions = `.jsonl` files in the project directory (Claude Code conversation transcripts)
- `MEMORY.md` is the memory index file and is excluded from memory listings
- `/api/tree` returns a hierarchical tree of all projects (used by the frontend's `ProjectTree`)
- DELETE endpoints remove memory files (and update `MEMORY.md`) or session files (and their companion directories)

**Frontend** (`frontend/`) — React SPA with a drill-down navigation flow: ProjectTree -> Category (memories or sessions) -> List -> Detail. Navigation state is managed via a `View` union type in `App.tsx`, not a router. All data fetching happens in `App.tsx` and is passed down as props.

**API proxy** — Vite proxies `/api` requests to the Flask backend (`vite.config.ts`), so the frontend calls relative paths like `/api/projects`.
