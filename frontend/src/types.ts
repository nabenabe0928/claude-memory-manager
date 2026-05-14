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
