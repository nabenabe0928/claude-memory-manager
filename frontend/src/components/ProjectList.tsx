import type { Project } from "../types";
import "./ProjectList.css";

interface Props {
  projects: Project[];
  onSelect: (id: string) => void;
}

export function ProjectList({ projects, onSelect }: Props) {
  return (
    <div className="project-list">
      <h2>Projects</h2>
      {projects.length === 0 && <p className="empty">No projects with memory found.</p>}
      <ul>
        {projects.map((p) => (
          <li key={p.id} onClick={() => onSelect(p.id)}>
            <span className="project-name">{p.displayName}</span>
            <span className="memory-count">{p.memoryCount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
