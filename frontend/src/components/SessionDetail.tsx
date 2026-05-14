import { useEffect, useState } from "react";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import type { Session } from "../types";
import "./SessionDetail.css";

interface Message {
  role: string;
  text: string;
}

interface Props {
  session: Session;
  projectId: string;
  onBack: () => void;
  onDelete: (sessionId: string) => void;
}

export function SessionDetail({ session, projectId, onBack, onDelete }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    });
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
        <button
          className="delete-btn"
          onClick={() => setShowConfirm(true)}
        >
          Delete
        </button>
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
          {messages.map((m, i) => (
            <div key={i} className={`message message-${m.role}`}>
              <div className="message-top">
                <span className="message-role">{m.role}</span>
                <button
                  className="copy-btn"
                  onClick={() => handleCopy(m.text, i)}
                >
                  {copiedIndex === i ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="message-text">{m.text}</pre>
            </div>
          ))}
        </div>
      )}
      {showConfirm && (
        <DeleteConfirmDialog
          memoryName={`session ${session.id.slice(0, 8)}...`}
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
