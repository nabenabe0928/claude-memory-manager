export interface Project {
  id: string;
  displayName: string;
  memoryCount: number;
  sessionCount: number;
}

export interface Memory {
  filename: string;
  name: string;
  description: string;
  type: string;
  content: string;
}

export interface Session {
  id: string;
  filename: string;
  summary: string;
  modifiedAt: string;
  sizeBytes: number;
  hasCompanionDir: boolean;
}
