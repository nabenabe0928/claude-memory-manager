#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION="claude-memory-manager"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already running. Attaching..."
  tmux attach -t "$SESSION"
  exit 0
fi

tmux new-session -d -s "$SESSION" -n backend
tmux send-keys -t "$SESSION:backend" "cd '$SCRIPT_DIR/backend' && uv pip install -r requirements.txt && uv run app.py" Enter

tmux new-window -t "$SESSION" -n frontend
tmux send-keys -t "$SESSION:frontend" "cd '$SCRIPT_DIR/frontend' && npm run dev" Enter

echo "Claude Memory Manager is running in tmux session '$SESSION'."
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:5001"
echo ""
echo "  tmux attach -t $SESSION    # attach"
echo "  tmux kill-session -t $SESSION  # stop"

tmux attach -t "$SESSION"
