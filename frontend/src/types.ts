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
