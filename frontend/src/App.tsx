import { useEffect, useState } from "react";
import { ProjectList } from "./components/ProjectList";
import { MemoryList } from "./components/MemoryList";
import { MemoryDetail } from "./components/MemoryDetail";
import type { Project, Memory } from "./types";
import "./App.css";

type View = "projects" | "memories" | "detail";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("projects");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data);
        setLoading(false);
      });
  }, []);

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    setSelectedMemory(null);
    fetch(`/api/projects/${id}/memories`)
      .then((r) => r.json())
      .then((data) => {
        setMemories(data);
        setView("memories");
      });
  };

  const handleSelectMemory = (memory: Memory) => {
    setSelectedMemory(memory);
    setView("detail");
  };

  const handleBackToProjects = () => {
    setSelectedProjectId(null);
    setMemories([]);
    setSelectedMemory(null);
    setView("projects");
  };

  const handleBackToMemories = () => {
    setSelectedMemory(null);
    setView("memories");
  };

  const handleDelete = (filename: string) => {
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
          prev
            .map((p) =>
              p.id === selectedProjectId
                ? { ...p, memoryCount: p.memoryCount - 1 }
                : p
            )
            .filter((p) => p.memoryCount > 0)
        );
        if (updated.length > 0) {
          setView("memories");
        } else {
          setSelectedProjectId(null);
          setView("projects");
        }
      });
  };

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Claude Memory Manager</h1>
      </header>
      <div className="app-body">
        {view === "projects" && (
          <ProjectList projects={projects} onSelect={handleSelectProject} />
        )}
        {view === "memories" && (
          <MemoryList
            memories={memories}
            projectName={
              projects.find((p) => p.id === selectedProjectId)?.displayName ?? ""
            }
            onSelect={handleSelectMemory}
            onBack={handleBackToProjects}
          />
        )}
        {view === "detail" && selectedMemory && (
          <MemoryDetail
            memory={selectedMemory}
            onDelete={handleDelete}
            onBack={handleBackToMemories}
          />
        )}
      </div>
    </div>
  );
}

export default App;
