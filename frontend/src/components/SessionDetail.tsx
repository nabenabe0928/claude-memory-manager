import { memo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github.css";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { CopyPathButton } from "./CopyPathButton";
import { RefreshButton } from "./RefreshButton";
import type { Session } from "../types";
import { modKey, altKey } from "../utils";
import "./markdown.css";
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
  projectDisplayName: string;
  onBack: () => void;
  onDelete: (sessionId: string) => void;
  onDuplicate: (sessionId: string) => void;
}

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

function CollapsiblePart({ part, isMdRendered }: { part: MessagePart; isMdRendered: boolean }) {
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
        isMdRendered ? (
          <div className="markdown-body collapsible-detail-md">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
              {part.detail}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="collapsible-detail">{part.detail}</pre>
        )
      )}
    </div>
  );
}

const MessagePartView = memo(function MessagePartView({ part, isMdRendered }: { part: MessagePart; isMdRendered: boolean }) {
  if (part.type === "text" && isMdRendered) {
    return (
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
          {part.text ?? ""}
        </ReactMarkdown>
      </div>
    );
  }
  if (part.type === "text") {
    return (
      <pre className="message-text">
        {part.text ?? ""}
      </pre>
    );
  }
  if (part.type === "image") {
    return <span className="message-label">{part.label}</span>;
  }
  return <CollapsiblePart part={part} isMdRendered={isMdRendered} />;
});

function getTextForCopy(m: Message) {
  return m.parts
    .map((p) => {
      if (p.type === "text") return p.text ?? "";
      const label = p.label ?? "";
      return p.detail ? `${label}\n${p.detail}` : label;
    })
    .join("\n");
}

export function SessionDetail({ session, projectId, projectDisplayName, onBack, onDelete, onDuplicate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedResume, setCopiedResume] = useState(false);
  const [confirmDeleteLine, setConfirmDeleteLine] = useState<number | null>(null);
  const [mdRendered, setMdRendered] = useState<Set<number>>(new Set());

  const toggleMarkdown = (index: number) => {
    setMdRendered((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const resumeCommand = projectDisplayName
    ? `cd ${projectDisplayName} && claude --resume ${session.id}`
    : `claude --resume ${session.id}`;

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
        setMdRendered(new Set());
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
    setMdRendered(new Set());
  };

  useEffect(() => {
    setMdRendered(new Set());
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
        <button className="back-btn" onClick={onBack} title={`Back (${modKey}+[)`}>
          &larr; Back to Sessions
        </button>
        <div className="detail-actions">
          <RefreshButton onRefresh={handleRefresh} />
          <button
            className="action-btn copy-path-btn"
            onClick={handleCopyResume}
            title={`${resumeCommand} (Copy by ${altKey}+R)`}
          >
            {copiedResume ? "Copied!" : "Copy resume cmd"}
          </button>
          <CopyPathButton path={session.path} />
          <button
            className="action-btn copy-path-btn"
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
        {projectDisplayName && <><span className="detail-project">Project: {projectDisplayName}</span> &middot; </>}
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
                <div className="message-actions">
                  {m.parts.some((p) => p.type === "text" || p.detail) && (
                    <button
                      className={`msg-action-btn md-btn${mdRendered.has(i) ? " md-btn-active" : ""}`}
                      onClick={() => toggleMarkdown(i)}
                    >
                      MD
                    </button>
                  )}
                  <button
                    className="msg-action-btn copy-btn"
                    onClick={() => handleCopy(getTextForCopy(m), i)}
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
                {m.parts.map((p, j) => (
                  <MessagePartView key={j} part={p} isMdRendered={mdRendered.has(i)} />
                ))}
              </div>
            </div>
          ))}
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
