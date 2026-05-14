import { useState } from "react";
import { modKey } from "../utils";

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
      title={`Refresh (${modKey}+R)`}
    >
      {refreshing ? "Refreshing..." : "Refresh"}
    </button>
  );
}
