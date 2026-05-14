import type { Project } from "../types";
import { RefreshButton } from "./RefreshButton";
import "./ProjectList.css";

interface Props {
  projects: Project[];
  onSelect: (id: string) => void;
  onRefresh: () => Promise<void> | void;
}

export function ProjectList({ projects, onSelect, onRefresh }: Props) {
  return (
    <div className="project-list">
      <div className="page-title-row">
        <h2>Projects</h2>
        <RefreshButton onRefresh={onRefresh} />
      </div>
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
