export interface Project {
  id: string;
  displayName: string;
  memoryCount: number;
}

export interface Memory {
  filename: string;
  name: string;
  description: string;
  type: string;
  content: string;
}
