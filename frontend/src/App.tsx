import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectTree } from "./components/ProjectTree";
import { CategoryPicker } from "./components/CategoryPicker";
import { MemoryList } from "./components/MemoryList";
import { MemoryDetail } from "./components/MemoryDetail";
import { SessionList } from "./components/SessionList";
import { SessionDetail } from "./components/SessionDetail";
import { QuickOpen } from "./components/QuickOpen";
import type { Project, Memory, Session, TreeChild, TreeResponse } from "./types";
import { modKey, altKey } from "./utils";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import "./App.css";

export type View = "projects" | "category" | "memories" | "detail" | "sessions" | "sessionDetail";

function App() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>("projects");
  const [toast, setToast] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("theme") !== "light");

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Map<string, TreeChild[]>>(new Map());
  const [selfProjectCache, setSelfProjectCache] = useState<Map<string, TreeResponse["selfProject"]>>(new Map());
  const [rootResponse, setRootResponse] = useState<TreeResponse | null>(null);

  const sessionDetailRefresh = useRef<(() => Promise<void>) | null>(null);
  const selectedProjectId = selectedProject?.id ?? null;

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setSelectedMemory(null);
    setView("category");
  };

  const handleSelectMemories = () => {
    if (!selectedProjectId) return;
    fetch(`/api/projects/${selectedProjectId}/memories`)
      .then((r) => r.json())
      .then((data) => {
        setMemories(data);
        setView("memories");
      });
  };

  const handleSelectSessions = () => {
    if (!selectedProjectId) return;
    fetch(`/api/projects/${selectedProjectId}/sessions`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
        setView("sessions");
      });
  };

  const handleSelectMemory = (memory: Memory) => {
    setSelectedMemory(memory);
    setView("detail");
  };

  const handleBackToProjects = () => {
    setSelectedProject(null);
    setMemories([]);
    setSessions([]);
    setSelectedMemory(null);
    setView("projects");
  };

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    setView("sessionDetail");
  };

  const handleBackToCategory = () => {
    setMemories([]);
    setSessions([]);
    setSelectedMemory(null);
    setSelectedSession(null);
    setView("category");
  };

  const handleBackToMemories = () => {
    setSelectedMemory(null);
    setView("memories");
  };

  const handleBackToSessions = () => {
    setSelectedSession(null);
    setView("sessions");
  };

  const handleDeleteMemory = (filename: string) => {
    if (!selectedProjectId) return;
    fetch(`/api/projects/${selectedProjectId}/memories/${filename}`, {
      method: "DELETE",
    })
      .then((r) => r.json())
      .then(() => {
        const updated = memories.filter((m) => m.filename !== filename);
        setMemories(updated);
        setSelectedMemory(null);
        setSelectedProject((prev) =>
          prev ? { ...prev, memoryCount: prev.memoryCount - 1 } : null,
        );
        if (updated.length > 0) {
          setView("memories");
        } else {
          setView("category");
        }
      });
  };

  const handleBatchDeleteMemories = async (filenames: string[]) => {
    if (!selectedProjectId) return;
    const res = await fetch(`/api/projects/${selectedProjectId}/memories/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filenames }),
    });
    const data = await res.json();
    const deletedSet = new Set(data.deleted as string[]);
    const updated = memories.filter((m) => !deletedSet.has(m.filename));
    setMemories(updated);
    setSelectedMemory(null);
    setSelectedProject((prev) =>
      prev ? { ...prev, memoryCount: prev.memoryCount - data.deleted.length } : null,
    );
    if (updated.length === 0) {
      setView("category");
    }
  };

  const handleBatchDeleteSessions = async (sessionIds: string[]) => {
    if (!selectedProjectId) return;
    const res = await fetch(`/api/projects/${selectedProjectId}/sessions/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionIds }),
    });
    const data = await res.json();
    const deletedSet = new Set(data.deleted as string[]);
    setSessions((prev) => prev.filter((s) => !deletedSet.has(s.id)));
    setSelectedProject((prev) =>
      prev ? { ...prev, sessionCount: prev.sessionCount - data.deleted.length } : null,
    );
  };

  const handleOpenPalette = () => {
    setPaletteOpen((prev) => !prev);
  };

  const handleToggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }, []);

  const handlePaletteNavigateMemory = (project: Project, memory: Memory) => {
    setPaletteOpen(false);
    setSelectedProject(project);
    setSelectedMemory(memory);
    setView("detail");
    fetch(`/api/projects/${project.id}/memories`)
      .then((r) => r.json())
      .then((data) => setMemories(data));
  };

  const handlePaletteNavigateMemories = (project: Project) => {
    setPaletteOpen(false);
    setSelectedProject(project);
    fetch(`/api/projects/${project.id}/memories`)
      .then((r) => r.json())
      .then((data) => {
        setMemories(data);
        setView("memories");
      });
  };

  const handlePaletteNavigateSessions = (project: Project) => {
    setPaletteOpen(false);
    setSelectedProject(project);
    fetch(`/api/projects/${project.id}/sessions`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
        setView("sessions");
      });
  };

  const handlePaletteNavigateSession = (project: Project, session: Session) => {
    setPaletteOpen(false);
    setSelectedProject(project);
    setSelectedSession(session);
    setView("sessionDetail");
    fetch(`/api/projects/${project.id}/sessions`)
      .then((r) => r.json())
      .then((data) => setSessions(data));
  };

  const handleRefreshProjects = () => {
    setExpandedPaths(new Set());
    setChildrenCache(new Map());
    setSelfProjectCache(new Map());
    setRootResponse(null);
    return Promise.resolve();
  };

  const handleRefreshCategory = () => {
    if (!selectedProjectId) return Promise.resolve();
    return fetch(`/api/projects/${selectedProjectId}/counts`)
      .then((r) => r.json())
      .then((counts) => {
        setSelectedProject((prev) =>
          prev ? { ...prev, memoryCount: counts.memoryCount, sessionCount: counts.sessionCount } : null,
        );
      });
  };

  const handleRefreshMemories = () => {
    if (!selectedProjectId) return Promise.resolve();
    return fetch(`/api/projects/${selectedProjectId}/memories`)
      .then((r) => r.json())
      .then((data) => setMemories(data));
  };

  const handleRefreshMemory = () => {
    if (!selectedProjectId) return Promise.resolve();
    return fetch(`/api/projects/${selectedProjectId}/memories`)
      .then((r) => r.json())
      .then((data) => {
        setMemories(data);
        if (selectedMemory) {
          const updated = data.find(
            (m: Memory) => m.filename === selectedMemory.filename,
          );
          setSelectedMemory(updated ?? null);
        }
      });
  };

  const handleRefreshSessions = () => {
    if (!selectedProjectId) return Promise.resolve();
    return fetch(`/api/projects/${selectedProjectId}/sessions`)
      .then((r) => r.json())
      .then((data) => setSessions(data));
  };

  const handleDeleteSession = (sessionId: string) => {
    if (!selectedProjectId) return;
    fetch(`/api/projects/${selectedProjectId}/sessions/${sessionId}`, {
      method: "DELETE",
    })
      .then((r) => r.json())
      .then(() => {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setSelectedProject((prev) =>
          prev ? { ...prev, sessionCount: prev.sessionCount - 1 } : null,
        );
      });
  };

  const handleDuplicateSession = (sessionId: string) => {
    if (!selectedProjectId) return;
    fetch(
      `/api/projects/${selectedProjectId}/sessions/${sessionId}/duplicate`,
      { method: "POST" },
    )
      .then((r) => {
        if (!r.ok) throw new Error("Duplicate failed");
        return r.json();
      })
      .then((newSession: Session) => {
        setSessions((prev) => [newSession, ...prev]);
        setSelectedProject((prev) =>
          prev ? { ...prev, sessionCount: prev.sessionCount + 1 } : null,
        );
        setSelectedSession(null);
        setView("sessions");
      })
      .catch(console.error);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(timer);
  }, [toast]);

  useKeyboardShortcuts({
    view,
    selectedProject: selectedProject ?? undefined,
    selectedMemory,
    selectedSession,
    projectDisplayName: selectedProject?.displayName ?? "",
    onBack: {
      category: handleBackToProjects,
      memories: handleBackToCategory,
      detail: handleBackToMemories,
      sessions: handleBackToCategory,
      sessionDetail: handleBackToSessions,
    },
    onRefresh: {
      projects: handleRefreshProjects,
      category: handleRefreshCategory,
      memories: handleRefreshMemories,
      detail: handleRefreshMemory,
      sessions: handleRefreshSessions,
      sessionDetail: () => sessionDetailRefresh.current?.() ?? Promise.resolve(),
    },
    onToast: setToast,
    onOpenPalette: handleOpenPalette,
    onToggleTheme: handleToggleTheme,
  });

  const isPopState = useRef(false);
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isPopState.current) {
      isPopState.current = false;
      return;
    }
    if (isInitialRender.current) {
      isInitialRender.current = false;
      history.replaceState({ view }, "");
      return;
    }
    history.pushState({ view }, "");
  }, [view]);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      isPopState.current = true;
      const targetView = (e.state?.view ?? "projects") as View;
      switch (targetView) {
        case "projects": handleBackToProjects(); break;
        case "category": handleBackToCategory(); break;
        case "memories": handleBackToMemories(); break;
        case "sessions": handleBackToSessions(); break;
        default: setView(targetView); break;
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleTreeToggle = useCallback(
    (path: string, children: TreeChild[], selfProject: TreeResponse["selfProject"]) => {
      setExpandedPaths((prev) => { const next = new Set(prev); next.add(path); return next; });
      setChildrenCache((prev) => new Map(prev).set(path, children));
      setSelfProjectCache((prev) => new Map(prev).set(path, selfProject));
    },
    [],
  );

  const handleTreeCollapse = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const handleRootLoaded = useCallback((response: TreeResponse) => {
    setRootResponse(response);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <h1>Claude Memory Manager</h1>
          <div className="app-header-actions">
            <button className="action-btn home-btn" onClick={handleToggleTheme} title={`Toggle theme (${altKey}+T)`}>
              {dark ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>
            {view !== "projects" && (
              <button className="action-btn home-btn" onClick={handleBackToProjects} title="Home">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12L12 3l9 9" />
                  <path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className="app-note">
          Note: Claude Code also reads CLAUDE.md, and settings.json in ~/.claude, which are not shown here.
        </p>
        <h3 className="shortcut-hints-title">Shortcut Hints</h3>
        <div className="shortcut-hints">
          <span>Back: {modKey}+[</span>
          <span>Refresh: Shift+R</span>
          <span>Copy path: {altKey}+P</span>
          <span>Copy resume cmd: {altKey}+R</span>
          <span>Quick Open: {modKey}+P</span>
          <span>Theme: {altKey}+T</span>
        </div>
      </header>
      <div className="app-body">
        {view === "projects" && (
          <ProjectTree
            expandedPaths={expandedPaths}
            childrenCache={childrenCache}
            selfProjectCache={selfProjectCache}
            rootResponse={rootResponse}
            onToggle={handleTreeToggle}
            onCollapse={handleTreeCollapse}
            onSelect={handleSelectProject}
            onRefresh={handleRefreshProjects}
            onRootLoaded={handleRootLoaded}
          />
        )}
        {view === "category" && selectedProject && (
          <CategoryPicker
            projectName={selectedProject.displayName}
            projectPath={selectedProject.path}
            memoryCount={selectedProject.memoryCount}
            sessionCount={selectedProject.sessionCount}
            onSelectMemories={handleSelectMemories}
            onSelectSessions={handleSelectSessions}
            onBack={handleBackToProjects}
            onRefresh={handleRefreshCategory}
          />
        )}
        {view === "memories" && (
          <MemoryList
            memories={memories}
            projectName={selectedProject?.displayName ?? ""}
            memoryDirPath={selectedProject ? selectedProject.path + "/memory" : ""}
            onSelect={handleSelectMemory}
            onBack={handleBackToCategory}
            onRefresh={handleRefreshMemories}
            onBatchDelete={handleBatchDeleteMemories}
          />
        )}
        {view === "detail" && selectedMemory && (
          <MemoryDetail
            memory={selectedMemory}
            projectDisplayName={selectedProject?.displayName ?? ""}
            onDelete={handleDeleteMemory}
            onBack={handleBackToMemories}
            onRefresh={handleRefreshMemory}
          />
        )}
        {view === "sessions" && (
          <SessionList
            sessions={sessions}
            projectName={selectedProject?.displayName ?? ""}
            onBack={handleBackToCategory}
            onSelect={handleSelectSession}
            onDelete={handleDeleteSession}
            onBatchDelete={handleBatchDeleteSessions}
            onRefresh={handleRefreshSessions}
          />
        )}
        {view === "sessionDetail" && selectedSession && selectedProjectId && (
          <SessionDetail
            session={selectedSession}
            projectId={selectedProjectId}
            projectDisplayName={selectedProject?.displayName ?? ""}
            onBack={handleBackToSessions}
            onDelete={(id) => {
              handleDeleteSession(id);
              handleBackToSessions();
            }}
            onDuplicate={handleDuplicateSession}
            onRegisterRefresh={(fn) => { sessionDetailRefresh.current = fn; }}
          />
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
      {paletteOpen && (
        <QuickOpen
          onNavigateToMemories={handlePaletteNavigateMemories}
          onNavigateToSessions={handlePaletteNavigateSessions}
          onNavigateToMemory={handlePaletteNavigateMemory}
          onNavigateToSession={handlePaletteNavigateSession}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
