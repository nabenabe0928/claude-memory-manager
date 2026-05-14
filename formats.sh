#!/usr/bin/env bash
set -euo pipefail
ROOT="$(dirname "$0")"

echo "=== Backend (ruff) ==="
cd backend
uv run ruff check --fix .
uv run ruff format .
cd ..

echo "=== Frontend (eslint) ==="
cd frontend
npm run lint -- --fix
cd ..
