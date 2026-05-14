# Project Structure

```
.
├── CLAUDE.md                          # Claude Code instructions
├── start.sh                           # Starts backend + frontend via tmux
│
├── .claude/
│   ├── agents/                        # Custom subagent definitions
│   │   ├── python-style.md
│   │   ├── python-test.md
│   │   ├── ts-style.md
│   │   └── ts-test.md
│   ├── settings.json                  # PostToolUse hooks (lint, format, test)
│   └── settings.local.json            # Local permission allowlist
│
├── backend/                           # Flask API (Python)
│   ├── app.py                         # Single-file API — all routes and helpers
│   ├── pyproject.toml                 # Dependencies + ruff/pytest/mypy config
│   ├── uv.lock
│   └── tests/
│       ├── conftest.py                # Fixtures (tmp project dirs, Flask test client)
│       ├── testing_utils.py           # Test helper functions
│       ├── test_api.py                # API endpoint tests
│       └── test_helpers.py            # Unit tests for helper functions
│
└── frontend/                          # React SPA (TypeScript / Vite)
    ├── index.html                     # Entry HTML
    ├── package.json                   # Dependencies + scripts (dev, build, lint, test)
    ├── vite.config.ts                 # Vite config — proxies /api to Flask backend
    ├── vitest.config.ts               # Vitest config
    ├── eslint.config.js               # ESLint config
    ├── tsconfig.json                  # TypeScript config (references app + node)
    ├── tsconfig.app.json
    ├── tsconfig.node.json
    ├── public/
    │   ├── favicon.svg
    │   └── icons.svg
    └── src/
        ├── main.tsx                   # App entry point
        ├── App.tsx                    # Root component — view routing + data fetching
        ├── App.css
        ├── index.css
        ├── types.ts                   # Shared TypeScript types
        ├── utils.ts                   # Shared utility functions (formatSize, etc.)
        ├── components/
        │   ├── ProjectList.tsx        # Project list view
        │   ├── CategoryPicker.tsx     # Memories vs Sessions picker
        │   ├── MemoryList.tsx         # Memory list for a project
        │   ├── MemoryDetail.tsx       # Single memory detail view
        │   ├── SessionList.tsx        # Session list for a project
        │   ├── SessionDetail.tsx      # Single session detail view
        │   ├── DeleteConfirmDialog.tsx # Reusable delete confirmation dialog
        │   ├── CopyPathButton.tsx     # Copy-to-clipboard button
        │   └── *.css                  # Component-level styles
        ├── components/__tests__/      # Component tests (Vitest + Testing Library)
        │   ├── ProjectList.test.tsx
        │   ├── CategoryPicker.test.tsx
        │   ├── MemoryList.test.tsx
        │   ├── MemoryDetail.test.tsx
        │   ├── SessionList.test.tsx
        │   ├── SessionDetail.test.tsx
        │   ├── DeleteConfirmDialog.test.tsx
        │   └── CopyPathButton.test.tsx
        └── test-utils/
            ├── setup.ts               # Test environment setup
            └── factories.ts           # Test data factories
```
