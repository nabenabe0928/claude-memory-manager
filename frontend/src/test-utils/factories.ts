import type { Project, Memory, Session } from "../types";

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    displayName: "My Project",
    path: "/home/user/.claude/projects/my-project",
    memoryCount: 3,
    sessionCount: 5,
    ...overrides,
  };
}

export function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    filename: "test-mem.md",
    path: "/path/to/test-mem.md",
    name: "test-memory",
    description: "A test memory description",
    type: "user",
    content: "Memory content body",
    ...overrides,
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "abc12345-6789-0def-ghij-klmnopqrstuv",
    filename: "abc12345.jsonl",
    path: "/path/to/abc12345.jsonl",
    summary: "A test session",
    modifiedAt: "2025-01-15T10:30:00Z",
    sizeBytes: 2048,
    hasCompanionDir: false,
    ...overrides,
  };
}
