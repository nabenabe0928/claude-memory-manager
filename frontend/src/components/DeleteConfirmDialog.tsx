import "./DeleteConfirmDialog.css";

interface Props {
  itemName: string;
  title?: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  itemName,
  title = "Confirm Delete",
  description,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>
          {description ?? (
            <>
              Are you sure you want to delete <strong>{itemName}</strong>? This
              action cannot be undone.
            </>
          )}
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
