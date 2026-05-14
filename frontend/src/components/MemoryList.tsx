import type { Memory } from "../types";
import { modKey } from "../utils";
import { CopyPathButton } from "./CopyPathButton";
import { RefreshButton } from "./RefreshButton";
import "./MemoryList.css";

interface Props {
  memories: Memory[];
  projectName: string;
  memoryDirPath: string;
  onSelect: (memory: Memory) => void;
  onBack: () => void;
  onRefresh: () => Promise<void> | void;
}

const TYPE_COLORS: Record<string, string> = {
  user: "#2196f3",
  feedback: "#ff9800",
  project: "#4caf50",
  reference: "#9c27b0",
  unknown: "#999",
};

export function MemoryList({ memories, projectName, memoryDirPath, onSelect, onBack, onRefresh }: Props) {
  return (
    <div className="memory-list">
      <button className="back-btn" onClick={onBack} title={`Back (${modKey}+[)`}>
        &larr; Back
      </button>
      <div className="page-title-row">
        <h2>{projectName}</h2>
        <CopyPathButton path={memoryDirPath} />
        <RefreshButton onRefresh={onRefresh} />
      </div>
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
