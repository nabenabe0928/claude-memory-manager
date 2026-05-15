import { useState } from "react";
import type { Session } from "../types";
import { formatSize, modKey } from "../utils";
import { useSelection } from "../hooks/useSelection";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { RefreshButton } from "./RefreshButton";
import "./SessionList.css";
import "./BatchToolbar.css";

interface Props {
  sessions: Session[];
  projectName: string;
  onBack: () => void;
  onSelect: (session: Session) => void;
  onDelete: (sessionId: string) => void;
  onBatchDelete: (sessionIds: string[]) => Promise<void>;
  onRefresh: () => Promise<void> | void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function SessionList({ sessions, projectName, onBack, onSelect, onDelete, onBatchDelete, onRefresh }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { selected, toggle, toggleAll, clear, isAllSelected, count } = useSelection<string>();
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  const allKeys = sessions.map((s) => s.id);

  return (
    <div className="session-list">
      <button className="back-btn" onClick={onBack} title={`Back (${modKey}+[)`}>
        &larr; Back
      </button>
      <div className="page-title-row">
        <h2>{projectName}</h2>
        <RefreshButton onRefresh={onRefresh} />
      </div>
      <p className="subtitle">{sessions.length} sessions</p>
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
      {sessions.length === 0 && <p className="empty">No sessions in this project.</p>}
      <ul>
        {sessions.map((s) => (
          <li
            key={s.id}
            className={selected.has(s.id) ? "selected" : ""}
            onClick={() => onSelect(s)}
          >
            <input
              type="checkbox"
              className="item-checkbox"
              checked={selected.has(s.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggle(s.id)}
            />
            <div className="session-info">
              <p className="session-summary">{s.summary}</p>
              <div className="session-meta">
                <span>{formatDate(s.modifiedAt)}</span>
                <span>{formatSize(s.sizeBytes)}</span>
              </div>
            </div>
            {count === 0 && (
              <button
                className="delete-btn-small"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(s.id);
                }}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {confirmId && (
        <DeleteConfirmDialog
          itemName={`session ${confirmId.slice(0, 8)}...`}
          title="Delete Session"
          description={`Are you sure you want to delete session ${confirmId.slice(0, 8)}...? This action cannot be undone.`}
          onConfirm={() => {
            onDelete(confirmId);
            setConfirmId(null);
          }}
          onCancel={() => setConfirmId(null)}
        />
      )}
      {showBatchConfirm && (
        <DeleteConfirmDialog
          itemName={`${count} sessions`}
          title="Delete Sessions"
          description={`Are you sure you want to delete ${count} ${count === 1 ? "session" : "sessions"}? This action cannot be undone.`}
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
