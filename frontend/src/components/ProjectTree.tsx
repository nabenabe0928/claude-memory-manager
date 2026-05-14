import { useEffect, useState } from "react";
import type { Project, TreeChild, TreeResponse } from "../types";
import { RefreshButton } from "./RefreshButton";
import "./ProjectTree.css";

function TreeIcon({ children }: { children: React.ReactNode }) {
  return <span className="tree-icon">{children}</span>;
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <TreeIcon>
      <svg viewBox="0 0 24 24" fill="#f9a825" stroke="#f57f17" strokeWidth="1">
        {open ? (
          <>
            <path d="M2 6c0-1.1.9-2 2-2h5l2 2h9c1.1 0 2 .9 2 2v1H2V6z" />
            <path d="M2 9h20l-2.5 11H4.5L2 9z" />
          </>
        ) : (
          <path d="M2 6c0-1.1.9-2 2-2h5l2 2h9c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6z" />
        )}
      </svg>
    </TreeIcon>
  );
}

function ProjectIcon() {
  return (
    <TreeIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="#1565c0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    </TreeIcon>
  );
}

function SelfProjectIcon() {
  return (
    <TreeIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="#1565c0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </TreeIcon>
  );
}

function CountBadges({ memoryCount, sessionCount }: { memoryCount: number; sessionCount: number }) {
  return (
    <div className="project-counts">
      {memoryCount > 0 && (
        <span className="count-badge memory-badge">{memoryCount} memories</span>
      )}
      <span className="count-badge session-badge">{sessionCount} sessions</span>
    </div>
  );
}

function toProject(
  id: string,
  displayName: string,
  projectPath: string,
  memoryCount: number,
  sessionCount: number,
): Project {
  return { id, displayName, path: projectPath, memoryCount, sessionCount };
}

interface TreeNodeRowProps {
  node: TreeChild;
  depth: number;
  parentDisplayPath: string;
  expandedPaths: Set<string>;
  childrenCache: Map<string, TreeChild[]>;
  selfProjectCache: Map<string, TreeResponse["selfProject"]>;
  onToggle: (path: string) => void;
  onSelect: (project: Project) => void;
}

function TreeNodeRow({
  node,
  depth,
  parentDisplayPath,
  expandedPaths,
  childrenCache,
  selfProjectCache,
  onToggle,
  onSelect,
}: TreeNodeRowProps) {
  const isExpanded = expandedPaths.has(node.path);
  const children = childrenCache.get(node.path);
  const displayPath =
    parentDisplayPath === "~"
      ? `~/${node.name}`
      : `${parentDisplayPath}/${node.name}`;

  const handleProjectClick = () => {
    if (!node.isProject || !node.projectId || !node.projectPath) return;
    onSelect(toProject(node.projectId, displayPath, node.projectPath, node.memoryCount, node.sessionCount));
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(node.path);
  };

  const selfProject = selfProjectCache.get(node.path);

  return (
    <>
      <li
        className={`tree-row ${node.isProject ? "tree-row-project" : ""}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {node.hasChildren ? (
          <button
            className="tree-toggle"
            onClick={handleToggle}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="tree-toggle-spacer" />
        )}
        {node.isProject ? <ProjectIcon /> : <FolderIcon open={isExpanded} />}
        <span
          className={`tree-node-name ${node.isProject ? "tree-clickable" : node.hasChildren ? "tree-dir-clickable" : "tree-dir"}`}
          onClick={node.isProject ? handleProjectClick : node.hasChildren ? handleToggle : undefined}
        >
          {node.name}
        </span>
        {node.isProject && (
          <CountBadges memoryCount={node.memoryCount} sessionCount={node.sessionCount} />
        )}
      </li>
      {isExpanded && selfProject && (
        <li
          className="tree-row tree-row-project tree-self-project"
          style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}
        >
          <span className="tree-toggle-spacer" />
          <SelfProjectIcon />
          <span
            className="tree-node-name tree-clickable"
            onClick={() =>
              onSelect(toProject(selfProject.id, displayPath, selfProject.projectPath, selfProject.memoryCount, selfProject.sessionCount))
            }
          >
            (this directory)
          </span>
          <CountBadges memoryCount={selfProject.memoryCount} sessionCount={selfProject.sessionCount} />
        </li>
      )}
      {isExpanded &&
        children?.map((child) => (
          <TreeNodeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            parentDisplayPath={displayPath}
            expandedPaths={expandedPaths}
            childrenCache={childrenCache}
            selfProjectCache={selfProjectCache}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

interface Props {
  expandedPaths: Set<string>;
  childrenCache: Map<string, TreeChild[]>;
  selfProjectCache: Map<string, TreeResponse["selfProject"]>;
  rootResponse: TreeResponse | null;
  onToggle: (path: string, children: TreeChild[], selfProject: TreeResponse["selfProject"]) => void;
  onCollapse: (path: string) => void;
  onSelect: (project: Project) => void;
  onRefresh: () => Promise<void> | void;
  onRootLoaded: (response: TreeResponse) => void;
}

export function ProjectTree({
  expandedPaths,
  childrenCache,
  selfProjectCache,
  rootResponse,
  onToggle,
  onCollapse,
  onSelect,
  onRefresh,
  onRootLoaded,
}: Props) {
  const [expandingPath, setExpandingPath] = useState<string | null>(null);

  useEffect(() => {
    if (rootResponse) return;
    fetch("/api/tree")
      .then((r) => r.json())
      .then((data: TreeResponse) => {
        onRootLoaded(data);
      });
  }, [rootResponse, onRootLoaded]);

  const handleToggle = async (path: string) => {
    if (expandedPaths.has(path)) {
      onCollapse(path);
      return;
    }
    if (childrenCache.has(path)) {
      onToggle(path, childrenCache.get(path)!, selfProjectCache.get(path) ?? null);
      return;
    }
    setExpandingPath(path);
    try {
      const resp = await fetch(`/api/tree?path=${encodeURIComponent(path)}`);
      const data: TreeResponse = await resp.json();
      onToggle(path, data.children, data.selfProject);
    } finally {
      setExpandingPath(null);
    }
  };

  if (!rootResponse) {
    return <div className="project-tree"><p className="empty">Loading...</p></div>;
  }

  const handleRootSelfClick = () => {
    if (!rootResponse.selfProject) return;
    const sp = rootResponse.selfProject;
    onSelect(toProject(sp.id, rootResponse.displayPath, sp.projectPath, sp.memoryCount, sp.sessionCount));
  };

  return (
    <div className="project-tree">
      <div className="page-title-row">
        <h2>Projects</h2>
        <RefreshButton onRefresh={onRefresh} />
      </div>
      {rootResponse.children.length === 0 && !rootResponse.selfProject && (
        <p className="empty">No projects found.</p>
      )}
      <ul>
        {rootResponse.selfProject && (
          <li className="tree-row tree-row-project tree-self-project">
            <span className="tree-toggle-spacer" />
            <SelfProjectIcon />
            <span
              className="tree-node-name tree-clickable"
              onClick={handleRootSelfClick}
            >
              {rootResponse.displayPath} (this directory)
            </span>
            <CountBadges
              memoryCount={rootResponse.selfProject.memoryCount}
              sessionCount={rootResponse.selfProject.sessionCount}
            />
          </li>
        )}
        {rootResponse.children.map((child) => (
          <TreeNodeRow
            key={child.path}
            node={child}
            depth={0}
            parentDisplayPath={rootResponse.displayPath}
            expandedPaths={expandedPaths}
            childrenCache={childrenCache}
            selfProjectCache={selfProjectCache}
            onToggle={handleToggle}
            onSelect={onSelect}
          />
        ))}
      </ul>
      {expandingPath && (
        <div className="tree-loading">Loading...</div>
      )}
    </div>
  );
}
