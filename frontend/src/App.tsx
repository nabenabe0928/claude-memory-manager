import { useEffect, useState } from "react";
import { ProjectList } from "./components/ProjectList";
import { CategoryPicker } from "./components/CategoryPicker";
import { MemoryList } from "./components/MemoryList";
import { MemoryDetail } from "./components/MemoryDetail";
import { SessionList } from "./components/SessionList";
import { SessionDetail } from "./components/SessionDetail";
import type { Project, Memory, Session } from "./types";
import { modKey, altKey } from "./utils";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import "./App.css";

export type View = "projects" | "category" | "memories" | "detail" | "sessions" | "sessionDetail";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("projects");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data);
        setLoading(false);
      });
  }, []);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
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
    setSelectedProjectId(null);
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
        setProjects((prev) =>
          prev.map((p) =>
            p.id === selectedProjectId
              ? { ...p, memoryCount: p.memoryCount - 1 }
              : p
          )
        );
        if (updated.length > 0) {
          setView("memories");
        } else {
          setView("category");
        }
      });
  };

  const handleRefreshProjects = () => {
    return fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data));
  };

  const handleRefreshCategory = () => {
    return fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data);
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
            (m: Memory) => m.filename === selectedMemory.filename
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
        setProjects((prev) =>
          prev.map((p) =>
            p.id === selectedProjectId
              ? { ...p, sessionCount: p.sessionCount - 1 }
              : p
          )
        );
      });
  };

  const handleDuplicateSession = (sessionId: string) => {
    if (!selectedProjectId) return;
    fetch(
      `/api/projects/${selectedProjectId}/sessions/${sessionId}/duplicate`,
      { method: "POST" }
    )
      .then((r) => {
        if (!r.ok) throw new Error("Duplicate failed");
        return r.json();
      })
      .then((newSession: Session) => {
        setSessions((prev) => [newSession, ...prev]);
        setProjects((prev) =>
          prev.map((p) =>
            p.id === selectedProjectId
              ? { ...p, sessionCount: p.sessionCount + 1 }
              : p
          )
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
    selectedProject,
    selectedMemory,
    selectedSession,
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
      sessionDetail: handleRefreshSessions,
    },
    onToast: setToast,
  });

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Claude Memory Manager</h1>
        <p className="app-note">
          Note: Claude Code also reads CLAUDE.md, and settings.json in ~/.claude, which are not shown here.
        </p>
        <h3 className="shortcut-hints-title">Shortcut Hints</h3>
        <div className="shortcut-hints">
          <span>Back: {modKey}+[</span>
          <span>Refresh: {modKey}+R</span>
          <span>Copy path: {altKey}+P</span>
          <span>Copy resume cmd: {altKey}+R</span>
        </div>
      </header>
      <div className="app-body">
        {view === "projects" && (
          <ProjectList projects={projects} onSelect={handleSelectProject} onRefresh={handleRefreshProjects} />
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
          />
        )}
        {view === "detail" && selectedMemory && (
          <MemoryDetail
            memory={selectedMemory}
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
            onRefresh={handleRefreshSessions}
          />
        )}
        {view === "sessionDetail" && selectedSession && selectedProjectId && (
          <SessionDetail
            session={selectedSession}
            projectId={selectedProjectId}
            onBack={handleBackToSessions}
            onDelete={(id) => {
              handleDeleteSession(id);
              handleBackToSessions();
            }}
            onDuplicate={handleDuplicateSession}
          />
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
