import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "./highlight-theme.css";
import { useSelection } from "../hooks/useSelection";
import { isEditableTarget } from "../hooks/useKeyboardShortcuts";
import { CacheStatsPanel } from "./CacheStatsPanel";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { CopyPathButton } from "./CopyPathButton";
import { RefreshButton } from "./RefreshButton";
import type { CacheStats, CacheStatsAgent, CacheStatsSession, CacheStatsTurn, Session } from "../types";
import { modKey, altKey, formatPercent } from "../utils";
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
  turn?: number | null;
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
  onToast?: (message: string) => void;
}

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];
// Matched against e.code: Alt+letter produces special characters on macOS, so e.key is unusable.
const CACHE_STATS_SHORTCUT_CODE = "KeyC";
const CACHE_STATS_SHORTCUT_LABEL = "C";

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

function isCacheRollup(value: unknown): value is CacheStatsSession {
  if (!value || typeof value !== "object") return false;
  const hitRate = (value as CacheStatsSession).hitRate;
  return hitRate === null || typeof hitRate === "number";
}

function isCacheTurnList(value: unknown): value is CacheStatsTurn[] {
  return Array.isArray(value) && value.every((turn) => typeof turn?.cause === "string");
}

function isCacheStatsAgent(value: unknown): value is CacheStatsAgent {
  const agent = value as CacheStatsAgent | null;
  return (
    typeof agent?.agentId === "string" && isCacheRollup(agent.session) && isCacheTurnList(agent.turns)
  );
}

// The endpoint is best-effort: anything that does not match the contract is treated as "no stats".
function parseCacheStats(data: unknown): CacheStats | null {
  const stats = data as CacheStats | null;
  if (!isCacheRollup(stats?.session)) return null;
  if (!isCacheTurnList(stats?.turns)) return null;
  // `subagents` is additive: an older or degraded backend omits it, and absence means "none".
  const subagents = (stats as { subagents?: unknown }).subagents ?? [];
  if (!Array.isArray(subagents) || !subagents.every(isCacheStatsAgent)) return null;
  return { ...stats, subagents };
}

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

export function SessionDetail({ session, projectId, projectDisplayName, onBack, onDelete, onDuplicate, onRegisterRefresh, onToast }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedResume, setCopiedResume] = useState(false);
  const [showCacheStats, setShowCacheStats] = useState(false);
  // Reset cache-stats state during render on session switch (App renders SessionDetail without a
  // key, so state would otherwise leak from the previous session until its fetch resolves).
  const [statsSessionId, setStatsSessionId] = useState(session.id);
  const activeSessionIdRef = useRef(session.id);
  if (statsSessionId !== session.id) {
    setStatsSessionId(session.id);
    setCacheStats(null);
    setShowCacheStats(false);
  }
  const [confirmDeleteLine, setConfirmDeleteLine] = useState<number | null>(null);
  const { selected: mdDisabled, toggle: toggleMarkdown, clear: clearMdDisabled } = useSelection<number>();
  const { selected: collapsed, toggle: toggleCollapse } = useSelection<number>();
  const { selected, toggle, toggleAll, clear, isAllSelected, count } = useSelection<number>();
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

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

  const loadCacheStats = useCallback((): Promise<void> => {
    // A slow response must not overwrite the stats of a session switched to in the meantime.
    const requestedSessionId = session.id;
    const isCurrent = () => activeSessionIdRef.current === requestedSessionId;
    return fetch(`/api/projects/${projectId}/sessions/${session.id}/cache-stats`)
      .then((r) => r.json())
      .then((data) => {
        if (isCurrent()) setCacheStats(parseCacheStats(data));
      })
      .catch(() => {
        if (isCurrent()) setCacheStats(null);
      });
  }, [projectId, session.id]);

  const handleDeleteMessage = (lineIndex: number) => {
    fetch(`/api/projects/${projectId}/sessions/${session.id}/messages/${lineIndex}`, {
      method: "DELETE",
    })
      .then((r) => {
        if (!r.ok) return;
        setConfirmDeleteLine(null);
        clearMdDisabled();
        return fetch(`/api/projects/${projectId}/sessions/${session.id}`);
      })
      .then((r) => r?.json())
      .then((data) => {
        if (!data) return;
        setMessages(data);
        void loadCacheStats();
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
        clearMdDisabled();
        return fetch(`/api/projects/${projectId}/sessions/${session.id}`);
      })
      .then((r) => r?.json())
      .then((data) => {
        if (!data) return;
        setMessages(data);
        void loadCacheStats();
      });
  };

  const handleRefresh = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/sessions/${session.id}`);
    const data = await r.json();
    setMessages(data);
    clearMdDisabled();
    await loadCacheStats();
  }, [projectId, session.id, clearMdDisabled, loadCacheStats]);

  // Local listener instead of useKeyboardShortcuts: the panel state lives in this component.
  const hasCacheStats = cacheStats !== null;
  useEffect(() => {
    if (!hasCacheStats) return;
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.code !== CACHE_STATS_SHORTCUT_CODE || isEditableTarget(e)) return;
      e.preventDefault();
      setShowCacheStats((shown) => !shown);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [hasCacheStats]);

  useEffect(() => {
    onRegisterRefresh?.(handleRefresh);
    return () => onRegisterRefresh?.(() => Promise.resolve());
  }, [handleRefresh, onRegisterRefresh]);

  useEffect(() => {
    activeSessionIdRef.current = session.id;
    fetch(`/api/projects/${projectId}/sessions/${session.id}`)
      .then((r) => r.json())
      .then((data) => {
        clearMdDisabled();
        setMessages(data);
        setLoading(false);
      });
    void loadCacheStats();
  }, [projectId, session.id, clearMdDisabled, loadCacheStats]);

  return (
    <div className="session-detail">
      <div className="session-detail-header">
        <button className="back-btn" onClick={onBack} title={`Back (${modKey}+[)`}>
          &larr; Back to Sessions
        </button>
        <div className="detail-actions">
          <RefreshButton onRefresh={handleRefresh} />
          {cacheStats && (
            <button
              className={`action-btn cache-stats-btn${showCacheStats ? " cache-stats-btn-active" : ""}`}
              onClick={() => setShowCacheStats((shown) => !shown)}
              aria-expanded={showCacheStats}
              aria-controls="cache-stats-panel"
              title={`${showCacheStats ? "Hide" : "Show"} per-turn cache stats (Toggle by ${altKey}+${CACHE_STATS_SHORTCUT_LABEL})`}
            >
              Cache stats
            </button>
          )}
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
        {cacheStats && (
          <> &middot; <span className="detail-cache-hit-rate">
            Cache hit rate: {formatPercent(cacheStats.session.hitRate)}
          </span></>
        )}
      </p>
      {cacheStats && showCacheStats && (
        <CacheStatsPanel
          stats={cacheStats}
          projectName={projectDisplayName}
          sessionSummary={session.summary}
          onToast={onToast}
        />
      )}
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
                  <button
                    className="collapse-toggle"
                    onClick={() => toggleCollapse(m.lineIndex)}
                    aria-label={collapsed.has(m.lineIndex) ? "Expand message" : "Collapse message"}
                  >
                    <span className="collapse-arrow">{collapsed.has(m.lineIndex) ? "▶" : "▼"}</span>
                  </button>
                  <span className="message-role">{m.role}</span>
                  {m.role === "assistant" && m.turn != null && (
                    <span className="message-turn">(Turn #{m.turn})</span>
                  )}
                </div>
                <div className="message-actions">
                  {m.parts.some((p) => p.type === "text" || p.detail) && (
                    <button
                      className={`msg-action-btn md-btn${!mdDisabled.has(m.lineIndex) ? " md-btn-active" : ""}`}
                      onClick={() => toggleMarkdown(m.lineIndex)}
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
              {!collapsed.has(m.lineIndex) && (
                <div className="message-body">
                  {m.parts.map((p, j) => (
                    <MessagePartView key={j} part={p} isMdRendered={!mdDisabled.has(m.lineIndex)} />
                  ))}
                </div>
              )}
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
