export interface Project {
  id: string;
  displayName: string;
  path: string;
  memoryCount: number;
  sessionCount: number;
}

export interface Memory {
  filename: string;
  path: string;
  name: string;
  description: string;
  type: string;
  content: string;
}

export interface Session {
  id: string;
  filename: string;
  path: string;
  summary: string;
  modifiedAt: string;
  sizeBytes: number;
  hasCompanionDir: boolean;
}

export interface CacheStatsTurn {
  cacheRead: number;
  cacheCreation: number;
  uncached: number;
  output: number;
  hitRate: number | null;
  gapS: number | null;
  ttlS: number;
  model: string;
  cause: string;
  timestamp: string;
}

export interface CacheStatsSession {
  turnCount: number;
  cacheRead: number;
  cacheCreation: number;
  uncached: number;
  output: number;
  hitRate: number | null;
}

// A subagent (Agent tool) run nested in the session. It is its own cache lifeline:
// its turns and rollup are independent of the main loop's and must never be merged into them.
export interface CacheStatsAgent {
  agentId: string;
  // Both are read from the agent's meta.json, which may be missing or partial.
  agentType: string | null;
  description: string | null;
  turns: CacheStatsTurn[];
  session: CacheStatsSession;
  skipped: number;
}

export interface CacheStats {
  turns: CacheStatsTurn[];
  session: CacheStatsSession;
  skipped: number;
  subagents: CacheStatsAgent[];
}

export interface TreeChild {
  name: string;
  path: string;
  isProject: boolean;
  projectId: string | null;
  projectPath: string | null;
  memoryCount: number;
  sessionCount: number;
  hasChildren: boolean;
}

export interface TreeResponse {
  path: string;
  displayPath: string;
  selfProject: {
    id: string;
    projectPath: string;
    memoryCount: number;
    sessionCount: number;
  } | null;
  children: TreeChild[];
}
