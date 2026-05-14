#!/usr/bin/env bash
set -euo pipefail

# Frontend
cd frontend/
npm run build
npx vitest run
cd ..

# Backend
cd "$(dirname "$0")/backend"
uv run pytest
cd ..
