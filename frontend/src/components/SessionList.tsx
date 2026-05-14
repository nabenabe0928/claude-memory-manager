import { useState } from "react";
import type { Session } from "../types";
import { formatSize } from "../utils";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { RefreshButton } from "./RefreshButton";
import "./SessionList.css";

interface Props {
  sessions: Session[];
  projectName: string;
  onBack: () => void;
  onSelect: (session: Session) => void;
  onDelete: (sessionId: string) => void;
  onRefresh: () => Promise<void> | void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function SessionList({ sessions, projectName, onBack, onSelect, onDelete, onRefresh }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="session-list">
      <button className="back-btn" onClick={onBack} title="Back (Cmd+[)">
        &larr; Back
      </button>
      <div className="page-title-row">
        <h2>{projectName}</h2>
        <RefreshButton onRefresh={onRefresh} />
      </div>
      <p className="subtitle">{sessions.length} sessions</p>
      {sessions.length === 0 && <p className="empty">No sessions in this project.</p>}
      <ul>
        {sessions.map((s) => (
          <li key={s.id} onClick={() => onSelect(s)}>
            <div className="session-info">
              <p className="session-summary">{s.summary}</p>
              <div className="session-meta">
                <span>{formatDate(s.modifiedAt)}</span>
                <span>{formatSize(s.sizeBytes)}</span>
              </div>
            </div>
            <button
              className="delete-btn-small"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmId(s.id);
              }}
            >
              Delete
            </button>
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
    </div>
  );
}
