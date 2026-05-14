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
      {projects.length === 0 && <p className="empty">No projects found.</p>}
      <ul>
        {projects.map((p) => (
          <li key={p.id} onClick={() => onSelect(p.id)}>
            <span className="project-name">{p.displayName}</span>
            <div className="project-counts">
              {p.memoryCount > 0 && (
                <span className="count-badge memory-badge">{p.memoryCount} memories</span>
              )}
              <span className="count-badge session-badge">{p.sessionCount} sessions</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
