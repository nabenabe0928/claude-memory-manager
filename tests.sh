#!/usr/bin/env bash
set -euo pipefail

cd frontend/
npm run build
npx vitest run
cd ..

cd backend
uv run pytest
cd ..
