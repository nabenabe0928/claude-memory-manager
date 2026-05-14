import { useEffect, useState } from "react";
import type { Project, TreeChild, TreeResponse } from "../types";
import { RefreshButton } from "./RefreshButton";
import "./ProjectTree.css";

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
    onSelect({
      id: node.projectId,
      displayName: displayPath,
      path: node.projectPath,
      memoryCount: node.memoryCount,
      sessionCount: node.sessionCount,
    });
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
        <span
          className={`tree-node-name ${node.isProject ? "tree-clickable" : node.hasChildren ? "tree-dir-clickable" : "tree-dir"}`}
          onClick={node.isProject ? handleProjectClick : node.hasChildren ? handleToggle : undefined}
        >
          {node.name}
        </span>
        {node.isProject && (
          <div className="project-counts">
            {node.memoryCount > 0 && (
              <span className="count-badge memory-badge">
                {node.memoryCount} memories
              </span>
            )}
            <span className="count-badge session-badge">
              {node.sessionCount} sessions
            </span>
          </div>
        )}
      </li>
      {isExpanded && selfProject && (
        <li
          className="tree-row tree-row-project tree-self-project"
          style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}
        >
          <span className="tree-toggle-spacer" />
          <span
            className="tree-node-name tree-clickable"
            onClick={() =>
              onSelect({
                id: selfProject.id,
                displayName: displayPath,
                path: selfProject.projectPath,
                memoryCount: selfProject.memoryCount,
                sessionCount: selfProject.sessionCount,
              })
            }
          >
            (this directory)
          </span>
          <div className="project-counts">
            {selfProject.memoryCount > 0 && (
              <span className="count-badge memory-badge">
                {selfProject.memoryCount} memories
              </span>
            )}
            <span className="count-badge session-badge">
              {selfProject.sessionCount} sessions
            </span>
          </div>
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
    const resp = await fetch(`/api/tree?path=${encodeURIComponent(path)}`);
    const data: TreeResponse = await resp.json();
    onToggle(path, data.children, data.selfProject);
    setExpandingPath(null);
  };

  if (!rootResponse) {
    return <div className="project-tree"><p className="empty">Loading...</p></div>;
  }

  const handleRootSelfClick = () => {
    if (!rootResponse.selfProject) return;
    onSelect({
      id: rootResponse.selfProject.id,
      displayName: rootResponse.displayPath,
      path: rootResponse.selfProject.projectPath,
      memoryCount: rootResponse.selfProject.memoryCount,
      sessionCount: rootResponse.selfProject.sessionCount,
    });
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
            <span
              className="tree-node-name tree-clickable"
              onClick={handleRootSelfClick}
            >
              {rootResponse.displayPath} (this directory)
            </span>
            <div className="project-counts">
              {rootResponse.selfProject.memoryCount > 0 && (
                <span className="count-badge memory-badge">
                  {rootResponse.selfProject.memoryCount} memories
                </span>
              )}
              <span className="count-badge session-badge">
                {rootResponse.selfProject.sessionCount} sessions
              </span>
            </div>
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
