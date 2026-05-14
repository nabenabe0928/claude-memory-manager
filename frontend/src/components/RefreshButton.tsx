import { useState } from "react";
import { modKey } from "../utils";

interface Props {
  onRefresh: () => Promise<void> | void;
}

export function RefreshButton({ onRefresh }: Props) {
  const [state, setState] = useState<"idle" | "refreshing" | "done">("idle");

  const handleClick = async () => {
    setState("refreshing");
    try {
      await onRefresh();
      setState("done");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("idle");
    }
  };

  const label = state === "refreshing" ? "Refreshing..." : state === "done" ? "Refreshed!" : "↻ Refresh";

  return (
    <button
      className="refresh-btn"
      onClick={handleClick}
      disabled={state !== "idle"}
      title={`Refresh (${modKey}+R)`}
    >
      {label}
    </button>
  );
}
