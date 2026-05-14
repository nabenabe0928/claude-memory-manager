import "./DeleteConfirmDialog.css";

interface Props {
  memoryName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ memoryName, onConfirm, onCancel }: Props) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Delete Memory</h3>
        <p>
          Are you sure you want to delete <strong>{memoryName}</strong>? This
          will also remove its entry from MEMORY.md. This action cannot be
          undone.
        </p>
        <div className="dialog-actions">
          <button className="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm-btn" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
