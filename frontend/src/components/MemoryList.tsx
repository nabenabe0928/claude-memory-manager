import type { Memory } from "../types";
import "./MemoryList.css";

interface Props {
  memories: Memory[];
  projectName: string;
  onSelect: (memory: Memory) => void;
  onBack: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  user: "#2196f3",
  feedback: "#ff9800",
  project: "#4caf50",
  reference: "#9c27b0",
  unknown: "#999",
};

export function MemoryList({ memories, projectName, onSelect, onBack }: Props) {
  return (
    <div className="memory-list">
      <button className="back-btn" onClick={onBack}>
        &larr; Back to Projects
      </button>
      <h2>{projectName}</h2>
      <p className="subtitle">{memories.length} memories</p>
      {memories.length === 0 && <p className="empty">No memories in this project.</p>}
      <ul>
        {memories.map((m) => (
          <li key={m.filename} onClick={() => onSelect(m)}>
            <div className="memory-header">
              <span
                className="type-badge"
                style={{ backgroundColor: TYPE_COLORS[m.type] || TYPE_COLORS.unknown }}
              >
                {m.type}
              </span>
              <span className="memory-name">{m.name}</span>
            </div>
            <p className="memory-desc">{m.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
