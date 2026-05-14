#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing Python dependencies..."
uv pip install -r "$SCRIPT_DIR/backend/requirements.txt"

echo "Starting Flask backend on :5001..."
uv run "$SCRIPT_DIR/backend/app.py" &
BACKEND_PID=$!

echo "Starting Vite dev server on :5173..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

echo ""
echo "Claude Memory Manager is running!"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:5001"
echo ""
echo "Press Ctrl+C to stop."

wait
