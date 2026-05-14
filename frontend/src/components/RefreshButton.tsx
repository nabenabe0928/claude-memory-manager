import { useState } from "react";

interface Props {
  onRefresh: () => Promise<void> | void;
}

export function RefreshButton({ onRefresh }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const handleClick = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <button
      className="refresh-btn"
      onClick={handleClick}
      disabled={refreshing}
    >
      {refreshing ? "Refreshing..." : "Refresh"}
    </button>
  );
}
