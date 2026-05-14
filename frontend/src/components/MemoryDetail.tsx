import { useState } from "react";
import type { Memory } from "../types";
import { modKey } from "../utils";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { CopyPathButton } from "./CopyPathButton";
import { RefreshButton } from "./RefreshButton";
import "./MemoryDetail.css";

interface Props {
  memory: Memory;
  onDelete: (filename: string) => void;
  onBack: () => void;
  onRefresh: () => Promise<void> | void;
}

export function MemoryDetail({ memory, onDelete, onBack, onRefresh }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="memory-detail">
      <button className="back-btn" onClick={onBack} title={`Back (${modKey}+[)`}>
        &larr; Back to Memories
      </button>
      <div className="detail-header">
        <div>
          <h2>{memory.name}</h2>
          <p className="detail-desc">{memory.description}</p>
        </div>
        <div className="detail-actions">
          <RefreshButton onRefresh={onRefresh} />
          <CopyPathButton path={memory.path} />
          <button className="delete-btn" onClick={() => setShowConfirm(true)}>
            Delete
          </button>
        </div>
      </div>
      <div className="detail-meta">
        <span className="detail-type">Type: {memory.type}</span>
        <span className="detail-file">File: {memory.filename}</span>
      </div>
      <pre className="detail-content">{memory.content}</pre>
      {showConfirm && (
        <DeleteConfirmDialog
          itemName={memory.name}
          title="Delete Memory"
          description={`Are you sure you want to delete "${memory.name}"? This will also remove its entry from MEMORY.md. This action cannot be undone.`}
          onConfirm={() => {
            onDelete(memory.filename);
            setShowConfirm(false);
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
