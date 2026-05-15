import { useState } from "react";
import type { Memory } from "../types";
import { modKey } from "../utils";
import { useSelection } from "../hooks/useSelection";
import { CopyPathButton } from "./CopyPathButton";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { RefreshButton } from "./RefreshButton";
import "./MemoryList.css";
import "./BatchToolbar.css";

interface Props {
  memories: Memory[];
  projectName: string;
  memoryDirPath: string;
  onSelect: (memory: Memory) => void;
  onBack: () => void;
  onRefresh: () => Promise<void> | void;
  onBatchDelete: (filenames: string[]) => Promise<void>;
}

const TYPE_COLORS: Record<string, string> = {
  user: "#2196f3",
  feedback: "#ff9800",
  project: "#4caf50",
  reference: "#9c27b0",
  unknown: "#999",
};

export function MemoryList({ memories, projectName, memoryDirPath, onSelect, onBack, onRefresh, onBatchDelete }: Props) {
  const { selected, toggle, toggleAll, clear, isAllSelected, count } = useSelection<string>();
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  const allKeys = memories.map((m) => m.filename);

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
      {count > 0 && (
        <div className="batch-toolbar">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={isAllSelected(allKeys)}
              onChange={() => toggleAll(allKeys)}
            />
            {count} selected
          </label>
          <button className="batch-delete-btn" onClick={() => setShowBatchConfirm(true)}>
            Delete Selected ({count})
          </button>
          <button className="batch-cancel-btn" onClick={clear}>Cancel</button>
        </div>
      )}
      {memories.length === 0 && <p className="empty">No memories in this project.</p>}
      <ul>
        {memories.map((m) => (
          <li
            key={m.filename}
            className={selected.has(m.filename) ? "selected" : ""}
            onClick={() => onSelect(m)}
          >
            <input
              type="checkbox"
              className="item-checkbox"
              checked={selected.has(m.filename)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggle(m.filename)}
            />
            <div className="memory-item-content">
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
            </div>
          </li>
        ))}
      </ul>
      {showBatchConfirm && (
        <DeleteConfirmDialog
          itemName={`${count} memories`}
          title="Delete Memories"
          description={`Are you sure you want to delete ${count} ${count === 1 ? "memory" : "memories"}? This action cannot be undone.`}
          onConfirm={() => {
            onBatchDelete(Array.from(selected));
            clear();
            setShowBatchConfirm(false);
          }}
          onCancel={() => setShowBatchConfirm(false)}
        />
      )}
    </div>
  );
}
