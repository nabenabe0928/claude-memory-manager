import { CopyPathButton } from "./CopyPathButton";
import { RefreshButton } from "./RefreshButton";
import "./CategoryPicker.css";

interface Props {
  projectName: string;
  projectPath: string;
  memoryCount: number;
  sessionCount: number;
  onSelectMemories: () => void;
  onSelectSessions: () => void;
  onBack: () => void;
  onRefresh: () => Promise<void> | void;
}

export function CategoryPicker({
  projectName,
  projectPath,
  memoryCount,
  sessionCount,
  onSelectMemories,
  onSelectSessions,
  onBack,
  onRefresh,
}: Props) {
  return (
    <div className="category-picker">
      <button className="back-btn" onClick={onBack} title="Back (Cmd+[)">
        &larr; Back to Projects
      </button>
      <div className="page-title-row">
        <h2>{projectName}</h2>
        <CopyPathButton path={projectPath} />
        <RefreshButton onRefresh={onRefresh} />
      </div>
      <div className="categories">
        <button
          className="category-card"
          onClick={onSelectMemories}
          disabled={memoryCount === 0}
        >
          <span className="category-label">Memories</span>
          <span className="category-count">{memoryCount}</span>
          <span className="category-desc">Structured memory files (user, feedback, project, reference)</span>
        </button>
        <button className="category-card" onClick={onSelectSessions}>
          <span className="category-label">Sessions</span>
          <span className="category-count">{sessionCount}</span>
          <span className="category-desc">Past conversation logs (.jsonl)</span>
        </button>
      </div>
    </div>
  );
}
