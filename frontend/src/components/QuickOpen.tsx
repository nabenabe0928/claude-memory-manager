import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Memory, Session, TreeChild, TreeResponse } from "../types";
import { fuzzyMatch } from "../fuzzyMatch";
import "./QuickOpen.css";

interface QuickOpenProps {
  onNavigateToProject: (project: Project) => void;
  onNavigateToMemories: (project: Project) => void;
  onNavigateToSessions: (project: Project) => void;
  onNavigateToMemory: (project: Project, memory: Memory) => void;
  onNavigateToSession: (project: Project, session: Session) => void;
  onClose: () => void;
}

type DrillItem =
  | { kind: "memory"; memory: Memory }
  | { kind: "session"; session: Session };

type QuickOpenResult =
  | { kind: "dir"; child: TreeChild; score: number; indices: number[] }
  | { kind: "project"; child: TreeChild; displayPath: string; score: number; indices: number[] }
  | { kind: "selfProject"; tree: TreeResponse; score: number; indices: number[] }
  | { kind: "memory"; projectChild: TreeChild; projectDisplayPath: string; memory: Memory; score: number; indices: number[] }
  | { kind: "session"; projectChild: TreeChild; projectDisplayPath: string; session: Session; score: number; indices: number[] };

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;

  const indexSet = new Set(indices);
  const parts: { text: string; highlighted: boolean }[] = [];
  let current = "";
  let currentHighlighted = false;

  for (let i = 0; i < text.length; i++) {
    const isMatch = indexSet.has(i);
    if (i === 0) {
      currentHighlighted = isMatch;
      current = text[i];
    } else if (isMatch === currentHighlighted) {
      current += text[i];
    } else {
      parts.push({ text: current, highlighted: currentHighlighted });
      current = text[i];
      currentHighlighted = isMatch;
    }
  }
  if (current) parts.push({ text: current, highlighted: currentHighlighted });

  return (
    <>
      {parts.map((p, i) =>
        p.highlighted ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}

function buildDisplayPath(parentDisplayPath: string, name: string): string {
  return parentDisplayPath === "~" ? `~/${name}` : `${parentDisplayPath}/${name}`;
}

function childToProject(child: TreeChild, displayPath: string): Project {
  return {
    id: child.projectId!,
    displayName: displayPath,
    path: child.projectPath!,
    memoryCount: child.memoryCount,
    sessionCount: child.sessionCount,
  };
}

function selfToTreeChild(tree: TreeResponse): TreeChild {
  const sp = tree.selfProject!;
  return {
    name: tree.path.split("/").pop() ?? "",
    path: tree.path,
    isProject: true,
    projectId: sp.id,
    projectPath: sp.projectPath,
    memoryCount: sp.memoryCount,
    sessionCount: sp.sessionCount,
    hasChildren: false,
  };
}

function getResultLabel(item: QuickOpenResult): string {
  switch (item.kind) {
    case "dir":
      return item.child.name + "/";
    case "project":
      return item.child.name;
    case "selfProject":
      return item.tree.displayPath + " (this directory; type . to select this)";
    case "memory":
      return item.memory.name || item.memory.filename;
    case "session":
      return item.session.summary || item.session.id;
  }
}

function getResultMeta(item: QuickOpenResult): string {
  switch (item.kind) {
    case "dir":
      return "directory";
    case "project":
    case "selfProject": {
      const mc = item.kind === "project" ? item.child.memoryCount : item.tree.selfProject!.memoryCount;
      const sc = item.kind === "project" ? item.child.sessionCount : item.tree.selfProject!.sessionCount;
      const parts: string[] = [];
      if (mc > 0) parts.push(`${mc} mem`);
      if (sc > 0) parts.push(`${sc} sess`);
      return parts.join(", ");
    }
    case "memory":
      return item.memory.type;
    case "session":
      return item.session.modifiedAt
        ? new Date(item.session.modifiedAt).toLocaleDateString()
        : "";
  }
}

function getResultKey(item: QuickOpenResult): string {
  switch (item.kind) {
    case "dir":
      return "dir:" + item.child.path;
    case "project":
      return "proj:" + item.child.projectId;
    case "selfProject":
      return "self:" + item.tree.path;
    case "memory":
      return "mem:" + item.memory.filename;
    case "session":
      return "ses:" + item.session.id;
  }
}

export function QuickOpen({
  onNavigateToProject,
  onNavigateToMemories,
  onNavigateToSessions,
  onNavigateToMemory,
  onNavigateToSession,
  onClose,
}: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [currentTree, setCurrentTree] = useState<TreeResponse | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const treeCacheRef = useRef<Map<string, TreeResponse>>(new Map());

  const [drillProjectChild, setDrillProjectChild] = useState<TreeChild | null>(null);
  const [drillProjectDisplayPath, setDrillProjectDisplayPath] = useState("");
  const [drillItems, setDrillItems] = useState<DrillItem[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const drillCacheRef = useRef<Map<string, DrillItem[]>>(new Map());

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const segments = query.split("/");
  const resolvedSegments = segments.slice(0, -1);
  const filterText = segments[segments.length - 1];

  const resolvedPath = resolvedSegments.length > 0
    ? resolvedSegments.join("/")
    : null;

  useEffect(() => {
    let active = true;

    const fetchTree = (path?: string) => {
      const cacheKey = path ?? "__root__";
      const cached = treeCacheRef.current.get(cacheKey);
      if (cached) {
        if (active) {
          setCurrentTree(cached);
          setTreeLoading(false);
        }
        return;
      }
      setTreeLoading(true);
      const url = path ? `/api/tree?path=${encodeURIComponent(path)}` : "/api/tree";
      fetch(url)
        .then((r) => r.json())
        .then((data: TreeResponse) => {
          treeCacheRef.current.set(cacheKey, data);
          if (active) {
            setCurrentTree(data);
            setTreeLoading(false);
          }
        });
    };

    if (!resolvedPath) {
      fetchTree();
      setDrillProjectChild(null);
      setDrillProjectDisplayPath("");
      setDrillItems([]);
      setDrillLoading(false);
      return () => { active = false; };
    }

    const pathSegments = resolvedPath.split("/");

    const resolve = async () => {
      let tree: TreeResponse;
      const rootKey = "__root__";
      const cachedRoot = treeCacheRef.current.get(rootKey);
      if (cachedRoot) {
        tree = cachedRoot;
      } else {
        setTreeLoading(true);
        const r = await fetch("/api/tree");
        tree = await r.json();
        treeCacheRef.current.set(rootKey, tree);
      }
      if (!active) return;

      for (let i = 0; i < pathSegments.length; i++) {
        const seg = pathSegments[i];

        if (seg === "." && i === pathSegments.length - 1 && tree.selfProject) {
          if (!active) return;
          const syntheticChild = selfToTreeChild(tree);
          setCurrentTree(tree);
          setTreeLoading(false);
          setDrillProjectChild(syntheticChild);
          setDrillProjectDisplayPath(tree.displayPath);

          const cachedDrill = drillCacheRef.current.get(tree.selfProject.id);
          if (cachedDrill) {
            setDrillItems(cachedDrill);
            setDrillLoading(false);
          } else {
            setDrillLoading(true);
            {
              const pid = tree.selfProject.id;
              const [memories, sessions] = await Promise.all([
                fetch(`/api/projects/${pid}/memories`).then((r) => r.ok ? r.json() : []).catch(() => []),
                fetch(`/api/projects/${pid}/sessions`).then((r) => r.ok ? r.json() : []).catch(() => []),
              ]) as [Memory[], Session[]];
              if (!active) return;
              const items: DrillItem[] = [
                ...memories.map((m) => ({ kind: "memory" as const, memory: m })),
                ...sessions.map((s) => ({ kind: "session" as const, session: s })),
              ];
              drillCacheRef.current.set(pid, items);
              setDrillItems(items);
            }
            if (active) setDrillLoading(false);
          }
          return;
        }

        let bestChild: TreeChild | null = null;
        let bestScore = Infinity;
        for (const child of tree.children) {
          const m = fuzzyMatch(seg, child.name);
          if (m && m.score < bestScore) {
            bestScore = m.score;
            bestChild = child;
          }
        }

        if (!bestChild) {
          if (active) {
            setCurrentTree(tree);
            setTreeLoading(false);
            setDrillProjectChild(null);
            setDrillProjectDisplayPath("");
            setDrillItems([]);
            setDrillLoading(false);
          }
          return;
        }

        const childDisplayPath = buildDisplayPath(tree.displayPath, bestChild.name);

        if (i === pathSegments.length - 1 && bestChild.isProject && !bestChild.hasChildren) {
          if (!active) return;
          setCurrentTree(tree);
          setTreeLoading(false);
          setDrillProjectChild(bestChild);
          setDrillProjectDisplayPath(childDisplayPath);

          const cachedDrill = drillCacheRef.current.get(bestChild.projectId!);
          if (cachedDrill) {
            setDrillItems(cachedDrill);
            setDrillLoading(false);
          } else {
            setDrillLoading(true);
            {
              const pid = bestChild.projectId!;
              const [memories, sessions] = await Promise.all([
                fetch(`/api/projects/${pid}/memories`).then((r) => r.ok ? r.json() : []).catch(() => []),
                fetch(`/api/projects/${pid}/sessions`).then((r) => r.ok ? r.json() : []).catch(() => []),
              ]) as [Memory[], Session[]];
              if (!active) return;
              const items: DrillItem[] = [
                ...memories.map((m) => ({ kind: "memory" as const, memory: m })),
                ...sessions.map((s) => ({ kind: "session" as const, session: s })),
              ];
              drillCacheRef.current.set(pid, items);
              setDrillItems(items);
            }
            if (active) setDrillLoading(false);
          }
          return;
        }

        if (!bestChild.hasChildren && !bestChild.isProject) {
          if (active) {
            setCurrentTree(tree);
            setTreeLoading(false);
            setDrillProjectChild(null);
            setDrillProjectDisplayPath("");
            setDrillItems([]);
            setDrillLoading(false);
          }
          return;
        }

        const cacheKey = bestChild.path;
        const cachedTree = treeCacheRef.current.get(cacheKey);
        if (cachedTree) {
          tree = cachedTree;
        } else {
          const r = await fetch(`/api/tree?path=${encodeURIComponent(bestChild.path)}`);
          tree = await r.json();
          treeCacheRef.current.set(cacheKey, tree);
        }
        if (!active) return;
      }

      if (active) {
        setCurrentTree(tree);
        setTreeLoading(false);
        setDrillProjectChild(null);
        setDrillProjectDisplayPath("");
        setDrillItems([]);
        setDrillLoading(false);
      }
    };

    resolve();
    return () => { active = false; };
  }, [resolvedPath]);

  const results: QuickOpenResult[] = useMemo(() => {
    if (drillProjectChild) {
      if (filterText === "") {
        return drillItems.map((item) => {
          if (item.kind === "memory") {
            return { kind: "memory" as const, projectChild: drillProjectChild, projectDisplayPath: drillProjectDisplayPath, memory: item.memory, score: 0, indices: [] };
          }
          return { kind: "session" as const, projectChild: drillProjectChild, projectDisplayPath: drillProjectDisplayPath, session: item.session, score: 0, indices: [] };
        });
      }
      const matched: QuickOpenResult[] = [];
      for (const item of drillItems) {
        const label = item.kind === "memory"
          ? (item.memory.name || item.memory.filename)
          : (item.session.summary || item.session.id);
        const m = fuzzyMatch(filterText, label);
        if (m) {
          if (item.kind === "memory") {
            matched.push({ kind: "memory", projectChild: drillProjectChild, projectDisplayPath: drillProjectDisplayPath, memory: item.memory, score: m.score, indices: m.indices });
          } else {
            matched.push({ kind: "session", projectChild: drillProjectChild, projectDisplayPath: drillProjectDisplayPath, session: item.session, score: m.score, indices: m.indices });
          }
        }
      }
      matched.sort((a, b) => a.score - b.score);
      return matched;
    }

    if (!currentTree) return [];

    const items: QuickOpenResult[] = [];

    if (currentTree.selfProject) {
      if (filterText === "") {
        items.push({ kind: "selfProject", tree: currentTree, score: -1, indices: [] });
      } else {
        const candidates = [". this directory", currentTree.displayPath === "~" ? "home" : currentTree.displayPath];
        let bestMatch: { score: number } | null = null;
        for (const c of candidates) {
          const m = fuzzyMatch(filterText, c);
          if (m && (!bestMatch || m.score < bestMatch.score)) {
            bestMatch = m;
          }
        }
        if (bestMatch) {
          items.push({ kind: "selfProject", tree: currentTree, score: bestMatch.score, indices: [] });
        }
      }
    }

    for (const child of currentTree.children) {
      const childDisplayPath = buildDisplayPath(currentTree.displayPath, child.name);
      if (filterText === "") {
        if (child.isProject && !child.hasChildren) {
          items.push({ kind: "project", child, displayPath: childDisplayPath, score: 0, indices: [] });
        } else {
          items.push({ kind: "dir", child, score: 0, indices: [] });
        }
      } else {
        const m = fuzzyMatch(filterText, child.name);
        if (m) {
          if (child.isProject && !child.hasChildren) {
            items.push({ kind: "project", child, displayPath: childDisplayPath, score: m.score, indices: m.indices });
          } else {
            items.push({ kind: "dir", child, score: m.score, indices: m.indices });
          }
        }
      }
    }

    if (filterText !== "") {
      items.sort((a, b) => a.score - b.score);
    }

    return items;
  }, [currentTree, drillProjectChild, drillProjectDisplayPath, drillItems, filterText]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = (result: QuickOpenResult) => {
    switch (result.kind) {
      case "dir":
        setQuery((resolvedPath ? resolvedPath + "/" : "") + result.child.name + "/");
        break;
      case "project": {
        const p = childToProject(result.child, result.displayPath);
        const hasMem = result.child.memoryCount > 0;
        const hasSess = result.child.sessionCount > 0;
        if (hasMem && !hasSess) {
          onNavigateToMemories(p);
        } else if (hasSess && !hasMem) {
          onNavigateToSessions(p);
        } else {
          onNavigateToProject(p);
        }
        break;
      }
      case "selfProject": {
        const sp = result.tree.selfProject!;
        const p: Project = {
          id: sp.id,
          displayName: result.tree.displayPath,
          path: sp.projectPath,
          memoryCount: sp.memoryCount,
          sessionCount: sp.sessionCount,
        };
        if (sp.memoryCount > 0 && sp.sessionCount === 0) {
          onNavigateToMemories(p);
        } else if (sp.sessionCount > 0 && sp.memoryCount === 0) {
          onNavigateToSessions(p);
        } else {
          onNavigateToProject(p);
        }
        break;
      }
      case "memory":
        onNavigateToMemory(childToProject(result.projectChild, result.projectDisplayPath), result.memory);
        break;
      case "session":
        onNavigateToSession(childToProject(result.projectChild, result.projectDisplayPath), result.session);
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results.length > 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "Tab": {
        e.preventDefault();
        if (results.length === 0 || selectedIndex >= results.length) break;
        const sel = results[selectedIndex];
        if (sel.kind === "dir" || sel.kind === "project") {
          setQuery((resolvedPath ? resolvedPath + "/" : "") + sel.child.name + "/");
        } else if (sel.kind === "selfProject") {
          setQuery((resolvedPath ? resolvedPath + "/" : "") + "./");
        }
        break;
      }
    }
  };

  const displayPath = currentTree?.displayPath ?? "~";
  const placeholder = drillProjectChild
    ? `Search in ${drillProjectChild.name} (memories & sessions)...`
    : `Search in ${displayPath}/...`;

  const loading = treeLoading || drillLoading;
  const hasSelfProject = !drillProjectChild && currentTree?.selfProject != null;

  return (
    <div className="quickopen-overlay" onClick={onClose}>
      <div className="quickopen-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="quickopen-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        {loading ? (
          <div className="quickopen-loading">Loading...</div>
        ) : results.length === 0 ? (
          <div className="quickopen-empty">No results</div>
        ) : (
          <ul ref={listRef} className="quickopen-results">
            {results.map((item, i) => (
              <li
                key={getResultKey(item)}
                className={`quickopen-result-item${i === selectedIndex ? " quickopen-selected" : ""}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {(item.kind === "memory" || item.kind === "session") && (
                  <span
                    className={`quickopen-kind-badge ${item.kind === "memory" ? "quickopen-kind-memory" : "quickopen-kind-session"}`}
                  >
                    {item.kind}
                  </span>
                )}
                {item.kind === "dir" && (
                  <span className="quickopen-kind-badge quickopen-kind-dir">dir</span>
                )}
                <span className="quickopen-result-name">
                  <HighlightedText text={getResultLabel(item)} indices={item.indices} />
                </span>
                <span className="quickopen-result-meta">{getResultMeta(item)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="quickopen-hint">
          ↑↓ navigate &middot; Enter select &middot; Tab drill in &middot; Esc close
          {hasSelfProject && <> &middot; ./ browse this directory's memories</>}
        </div>
      </div>
    </div>
  );
}
