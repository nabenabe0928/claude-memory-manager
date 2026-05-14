# Claude Memory Manager

A web app for browsing and managing Claude Code's per-project memory files and session logs stored in `~/.claude/projects/`.
View, inspect, and delete memories and session transcripts across all your projects.

## Prerequisites

- Python 3.10+
- Node.js
- [uv](https://docs.astral.sh/uv/)
- tmux (optional, for `start.sh`)

## Installation

```bash
git clone https://github.com/nabenabe0928/claude-memory-manager.git
cd claude-memory-manager

# Backend dependencies
cd backend
uv sync
cd ..

# Frontend dependencies
cd frontend
npm install
cd ..
```

## Quick Start

```bash
./start.sh
```

Opens both servers in a tmux session:

- Frontend: http://localhost:5173
- Backend: http://localhost:5001

## Running Individually

**Backend:**

```bash
cd backend
uv run app.py
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to the Flask backend automatically.

## Testing

```bash
./test_backend.sh    # runs pytest
./test_frontend.sh   # runs tsc + vitest
```

Or manually:

```bash
cd backend && uv run pytest
cd frontend && npm test
```

## Tech Stack

- **Backend:** Flask, python-frontmatter
- **Frontend:** React 19, TypeScript, Vite
- **Testing:** pytest (backend), Vitest + Testing Library (frontend)

## How It Works

The backend reads directly from `~/.claude/projects/` on the filesystem — there is no database. Projects are directories, memories are `.md` files with YAML frontmatter, and sessions are `.jsonl` conversation transcripts.

The frontend provides a drill-down navigation flow: **Projects → Category (memories / sessions) → List → Detail**.
