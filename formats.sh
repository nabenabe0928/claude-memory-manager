#!/usr/bin/env bash
set -euo pipefail

set -euo pipefail
cd backend
uv run ruff check --fix .
uv run ruff format .
cd ..

cd frontend
npm run lint -- --fix
cd ..
