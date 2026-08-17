import type {
  CacheStats,
  CacheStatsAgent,
  CacheStatsSession,
  CacheStatsTurn,
  Project,
  Memory,
  Session,
  TreeChild,
  TreeResponse,
} from "../types";

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

export function makeCacheStatsTurn(overrides: Partial<CacheStatsTurn> = {}): CacheStatsTurn {
  return {
    cacheRead: 37000,
    cacheCreation: 1000,
    uncached: 0,
    output: 500,
    hitRate: 0.9737,
    gapS: 12.5,
    ttlS: 300,
    model: "claude-sonnet-4",
    cause: "-",
    timestamp: "2025-01-15T10:30:00Z",
    ...overrides,
  };
}

export function makeCacheStatsSession(
  overrides: Partial<CacheStatsSession> = {},
): CacheStatsSession {
  return {
    turnCount: 3,
    cacheRead: 37000,
    cacheCreation: 1000,
    uncached: 0,
    output: 500,
    hitRate: 0.9737,
    ...overrides,
  };
}

export function makeCacheStatsAgent(overrides: Partial<CacheStatsAgent> = {}): CacheStatsAgent {
  return {
    agentId: "a04914af8a35090c0",
    agentType: "python-style-reviewer",
    description: "Review backend Python style",
    turns: [makeCacheStatsTurn()],
    session: makeCacheStatsSession(),
    skipped: 0,
    ...overrides,
  };
}

export function makeCacheStats(overrides: Partial<CacheStats> = {}): CacheStats {
  return {
    turns: [makeCacheStatsTurn()],
    session: makeCacheStatsSession(),
    skipped: 0,
    subagents: [],
    ...overrides,
  };
}

export function makeTreeChild(overrides: Partial<TreeChild> = {}): TreeChild {
  return {
    name: "my-project",
    path: "/home/user/my-project",
    isProject: true,
    projectId: "proj-1",
    projectPath: "/home/user/.claude/projects/-home-user-my-project",
    memoryCount: 3,
    sessionCount: 5,
    hasChildren: false,
    ...overrides,
  };
}

export function makeTreeResponse(overrides: Partial<TreeResponse> = {}): TreeResponse {
  return {
    path: "/home/user",
    displayPath: "~",
    selfProject: null,
    children: [],
    ...overrides,
  };
}
