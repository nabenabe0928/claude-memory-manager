import { useEffect, useState } from "react";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { CopyPathButton } from "./CopyPathButton";
import { RefreshButton } from "./RefreshButton";
import type { Session } from "../types";
import "./SessionDetail.css";

interface MessagePart {
  type: "text" | "tool_use" | "tool_result" | "image";
  text?: string;
  label?: string;
  detail?: string;
}

interface Message {
  role: string;
  lineIndex: number;
  parts: MessagePart[];
}

interface Props {
  session: Session;
  projectId: string;
  onBack: () => void;
  onDelete: (sessionId: string) => void;
  onDuplicate: (sessionId: string) => void;
}

function CollapsiblePart({ part }: { part: MessagePart }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="collapsible-part">
      <button
        className="collapsible-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="collapsible-arrow">{expanded ? "▼" : "▶"}</span>
        {part.label}
      </button>
      {expanded && part.detail && (
        <pre className="collapsible-detail">{part.detail}</pre>
      )}
    </div>
  );
}

export function SessionDetail({ session, projectId, onBack, onDelete, onDuplicate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedResume, setCopiedResume] = useState(false);
  const [confirmDeleteLine, setConfirmDeleteLine] = useState<number | null>(null);

  const resumeCommand = `claude --resume ${session.id}`;

  const handleCopyResume = () => {
    navigator.clipboard.writeText(resumeCommand).then(() => {
      setCopiedResume(true);
      setTimeout(() => setCopiedResume(false), 1500);
    });
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    });
  };

  const handleDeleteMessage = (lineIndex: number) => {
    fetch(`/api/projects/${projectId}/sessions/${session.id}/messages/${lineIndex}`, {
      method: "DELETE",
    })
      .then((r) => {
        if (!r.ok) return;
        setConfirmDeleteLine(null);
        return fetch(`/api/projects/${projectId}/sessions/${session.id}`);
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data) setMessages(data);
      });
  };

  const handleRefresh = async () => {
    const r = await fetch(`/api/projects/${projectId}/sessions/${session.id}`);
    const data = await r.json();
    setMessages(data);
  };

  useEffect(() => {
    fetch(`/api/projects/${projectId}/sessions/${session.id}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data);
        setLoading(false);
      });
  }, [projectId, session.id]);

  return (
    <div className="session-detail">
      <div className="session-detail-header">
        <button className="back-btn" onClick={onBack}>
          &larr; Back to Sessions
        </button>
        <div className="detail-actions">
          <RefreshButton onRefresh={handleRefresh} />
          <button
            className="copy-path-btn"
            onClick={handleCopyResume}
            title={resumeCommand}
          >
            {copiedResume ? "Copied!" : "Copy resume cmd"}
          </button>
          <CopyPathButton path={session.path} />
          <button
            className="copy-path-btn"
            onClick={() => onDuplicate(session.id)}
          >
            Duplicate
          </button>
          <button
            className="delete-btn"
            onClick={() => setShowConfirm(true)}
          >
            Delete
          </button>
        </div>
      </div>
      <h2>Session {session.id.slice(0, 8)}...</h2>
      <p className="session-detail-meta">
        {new Date(session.modifiedAt).toLocaleString()}
      </p>
      {loading ? (
        <p className="loading-text">Loading conversation...</p>
      ) : messages.length === 0 ? (
        <p className="empty">No messages found in this session.</p>
      ) : (
        <div className="messages">
          {messages.map((m, i) => {
            const textForCopy = m.parts
              .map((p) => {
                if (p.type === "text") return p.text ?? "";
                const label = p.label ?? "";
                return p.detail ? `${label}\n${p.detail}` : label;
              })
              .join("\n");
            return (
              <div key={i} className={`message message-${m.role}`}>
                <div className="message-top">
                  <span className="message-role">{m.role}</span>
                  <div className="message-actions">
                    <button
                      className="msg-action-btn copy-btn"
                      onClick={() => handleCopy(textForCopy, i)}
                    >
                      {copiedIndex === i ? "Copied!" : "Copy"}
                    </button>
                    <button
                      className="msg-action-btn msg-delete-btn"
                      onClick={() => setConfirmDeleteLine(m.lineIndex)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="message-body">
                  {m.parts.map((p, j) =>
                    p.type === "text" ? (
                      <pre key={j} className="message-text">
                        {p.text}
                      </pre>
                    ) : p.type === "image" ? (
                      <span key={j} className="message-label">
                        {p.label}
                      </span>
                    ) : (
                      <CollapsiblePart key={j} part={p} />
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {confirmDeleteLine !== null && (
        <DeleteConfirmDialog
          itemName="this message"
          onConfirm={() => handleDeleteMessage(confirmDeleteLine)}
          onCancel={() => setConfirmDeleteLine(null)}
        />
      )}
      {showConfirm && (
        <DeleteConfirmDialog
          itemName={`session ${session.id.slice(0, 8)}...`}
          title="Delete Session"
          description={`Are you sure you want to delete session ${session.id.slice(0, 8)}...? This action cannot be undone.`}
          onConfirm={() => {
            onDelete(session.id);
            setShowConfirm(false);
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
