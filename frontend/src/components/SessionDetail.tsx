import { memo, useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "./highlight-theme.css";
import { useSelection } from "../hooks/useSelection";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { CopyPathButton } from "./CopyPathButton";
import { RefreshButton } from "./RefreshButton";
import type { Session } from "../types";
import { modKey, altKey } from "../utils";
import "./markdown.css";
import "./SessionDetail.css";
import "./BatchToolbar.css";

interface MessagePart {
  type: "text" | "tool_use" | "tool_result" | "image";
  text?: string;
  label?: string;
  detail?: string;
}

interface Message {
  role: string;
  lineIndex: number;
  uuid?: string | null;
  parentUuid?: string | null;
  parts: MessagePart[];
}

interface Props {
  session: Session;
  projectId: string;
  projectDisplayName: string;
  onBack: () => void;
  onDelete: (sessionId: string) => void;
  onDuplicate: (sessionId: string) => void;
  onRegisterRefresh?: (refresh: () => Promise<void>) => void;
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

function countUncheckedDescendants(messages: Message[], targetIndices: Set<number>): number {
  const childrenOf = new Map<string, number[]>();
  const uuidAt = new Map<number, string>();
  for (const m of messages) {
    if (m.uuid) uuidAt.set(m.lineIndex, m.uuid);
    if (m.parentUuid) {
      const list = childrenOf.get(m.parentUuid) ?? [];
      list.push(m.lineIndex);
      childrenOf.set(m.parentUuid, list);
    }
  }
  const cascade = new Set<number>();
  const queue: string[] = [];
  for (const idx of targetIndices) {
    const uid = uuidAt.get(idx);
    if (uid) queue.push(uid);
  }
  const visited = new Set<string>();
  while (queue.length > 0) {
    const uid = queue.pop()!;
    if (visited.has(uid)) continue;
    visited.add(uid);
    for (const childIdx of childrenOf.get(uid) ?? []) {
      cascade.add(childIdx);
      const childUid = uuidAt.get(childIdx);
      if (childUid) queue.push(childUid);
    }
  }
  let unchecked = 0;
  for (const idx of cascade) {
    if (!targetIndices.has(idx)) unchecked++;
  }
  return unchecked;
}

export function SessionDetail({ session, projectId, projectDisplayName, onBack, onDelete, onDuplicate, onRegisterRefresh }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedResume, setCopiedResume] = useState(false);
  const [confirmDeleteLine, setConfirmDeleteLine] = useState<number | null>(null);
  const [mdRendered, setMdRendered] = useState<Set<number>>(new Set());
  const { selected, toggle, toggleAll, clear, isAllSelected, count } = useSelection<number>();
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

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

  const handleBatchDeleteMessages = () => {
    fetch(`/api/projects/${projectId}/sessions/${session.id}/messages/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIndices: Array.from(selected) }),
    })
      .then((r) => {
        if (!r.ok) return;
        clear();
        setShowBatchConfirm(false);
        setMdRendered(new Set());
        return fetch(`/api/projects/${projectId}/sessions/${session.id}`);
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data) setMessages(data);
      });
  };

  const handleRefresh = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/sessions/${session.id}`);
    const data = await r.json();
    setMessages(data);
    setMdRendered(new Set());
  }, [projectId, session.id]);

  useEffect(() => {
    onRegisterRefresh?.(handleRefresh);
    return () => onRegisterRefresh?.(() => Promise.resolve());
  }, [handleRefresh, onRegisterRefresh]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/sessions/${session.id}`)
      .then((r) => r.json())
      .then((data) => {
        setMdRendered(new Set());
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
        <>
        {count > 0 && (
          <div className="batch-toolbar">
            <label className="select-all-label">
              <input
                type="checkbox"
                checked={isAllSelected(messages.map((m) => m.lineIndex))}
                onChange={() => toggleAll(messages.map((m) => m.lineIndex))}
              />
              {count} selected
            </label>
            <button className="batch-delete-btn" onClick={() => setShowBatchConfirm(true)}>
              Delete Selected ({count})
            </button>
            <button className="batch-cancel-btn" onClick={clear}>Cancel</button>
          </div>
        )}
        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`message message-${m.role}${selected.has(m.lineIndex) ? " message-selected" : ""}`}>
              <div className="message-top">
                <div className="message-top-left">
                  <input
                    type="checkbox"
                    className="item-checkbox"
                    checked={selected.has(m.lineIndex)}
                    onChange={() => toggle(m.lineIndex)}
                  />
                  <span className="message-role">{m.role}</span>
                </div>
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
        </>
      )}
      {confirmDeleteLine !== null && (
        <DeleteConfirmDialog
          itemName="this message"
          description={(() => {
            const extra = countUncheckedDescendants(messages, new Set([confirmDeleteLine]));
            return extra > 0
              ? `Are you sure you want to delete this message? ${extra} dependent ${extra === 1 ? "reply" : "replies"} will also be deleted. This action cannot be undone.`
              : undefined;
          })()}
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
      {showBatchConfirm && (
        <DeleteConfirmDialog
          itemName={`${count} messages`}
          title="Delete Messages"
          description={(() => {
            const extra = countUncheckedDescendants(messages, selected);
            return `Are you sure you want to delete ${count} ${count === 1 ? "message" : "messages"}?${extra > 0 ? ` ${extra} additional dependent ${extra === 1 ? "reply" : "replies"} will also be deleted.` : ""} This action cannot be undone.`;
          })()}
          onConfirm={handleBatchDeleteMessages}
          onCancel={() => setShowBatchConfirm(false)}
        />
      )}
    </div>
  );
}
