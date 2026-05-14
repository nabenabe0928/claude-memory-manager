# Claude Memory Manager

A web app for browsing and managing Claude Code's per-project memory files and session logs stored in `~/.claude/projects/`.
View, inspect, and delete memories and session transcripts across all your projects.

## Prerequisites

- Python 3.10+
- Node.js
- [uv](https://docs.astral.sh/uv/)
- tmux (optional, for `start.sh`)

> [!NOTE]
> Backend uses `Flask` and `python-frontmatter`. Frontend uses `React`, and `Vite`.

## Installation

```bash
git clone https://github.com/nabenabe0928/claude-memory-manager.git
cd claude-memory-manager

# Backend & frontend dependencies
cd backend && uv sync && cd ..
cd frontend && npm install && cd ..
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
# Backend
cd backend && uv run app.py
# Frontend
cd frontend && npm install && npm run dev
```

The Vite dev server proxies `/api` requests to the Flask backend automatically.

## Testing & Formatting

```bash
./tests.sh
./formats.sh
```

## How It Works

The backend reads directly from `~/.claude/projects/` on the filesystem — there is no database. Projects are directories, memories are `.md` files with YAML frontmatter, and sessions are `.jsonl` conversation transcripts.

The frontend provides a drill-down navigation flow: **Projects → Category (memories / sessions) → List → Detail**.

## License

[MIT](LICENSE)
