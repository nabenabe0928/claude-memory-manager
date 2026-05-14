import "./CategoryPicker.css";

interface Props {
  projectName: string;
  memoryCount: number;
  sessionCount: number;
  onSelectMemories: () => void;
  onSelectSessions: () => void;
  onBack: () => void;
}

export function CategoryPicker({
  projectName,
  memoryCount,
  sessionCount,
  onSelectMemories,
  onSelectSessions,
  onBack,
}: Props) {
  return (
    <div className="category-picker">
      <button className="back-btn" onClick={onBack}>
        &larr; Back to Projects
      </button>
      <h2>{projectName}</h2>
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
