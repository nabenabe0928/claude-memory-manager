# Frontend Overview

## Source Structure

```
frontend/src/
├── main.tsx                          # App entry point
├── App.tsx                           # Root component — view routing + data fetching
├── App.css
├── index.css
├── types.ts                          # Shared TypeScript types
├── utils.ts                          # Shared utilities (formatSize, etc.)
├── fuzzyMatch.ts                     # Fuzzy matching logic (for QuickOpen)
├── hooks/
│   ├── useKeyboardShortcuts.ts       # Global keyboard shortcut handler
│   ├── useSelection.ts              # Selection state hook
│   └── __tests__/
│       └── useKeyboardShortcuts.test.tsx
├── components/
│   ├── ProjectTree.tsx / .css        # Hierarchical project navigation
│   ├── CategoryPicker.tsx / .css     # Memories vs Sessions picker
│   ├── MemoryList.tsx / .css         # Memory list for a project
│   ├── MemoryDetail.tsx / .css       # Single memory detail view
│   ├── SessionList.tsx / .css        # Session list for a project
│   ├── SessionDetail.tsx / .css      # Single session detail view
│   ├── QuickOpen.tsx / .css          # Quick-open search dialog
│   ├── DeleteConfirmDialog.tsx / .css# Reusable delete confirmation dialog
│   ├── CopyPathButton.tsx / .css     # Copy-to-clipboard button
│   ├── RefreshButton.tsx             # Refresh data button
│   ├── BatchToolbar.css              # Batch operation toolbar styles
│   ├── markdown.css                  # Markdown rendering styles
│   ├── highlight-theme.css           # Syntax highlight theme
│   └── __tests__/                    # Component tests (Vitest + Testing Library)
│       ├── CategoryPicker.test.tsx
│       ├── CopyPathButton.test.tsx
│       ├── DeleteConfirmDialog.test.tsx
│       ├── MemoryDetail.test.tsx
│       ├── MemoryList.test.tsx
│       ├── ProjectTree.test.tsx
│       ├── QuickOpen.test.tsx
│       ├── RefreshButton.test.tsx
│       ├── SessionDetail.test.tsx
│       └── SessionList.test.tsx
├── test-utils/
│   ├── factories.ts                  # Test data factories
│   └── setup.ts                      # Test environment setup
└── __tests__/
    ├── fuzzyMatch.test.ts
    └── utils.test.ts
```