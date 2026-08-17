export const isMac = navigator.platform.toUpperCase().includes("MAC");
export const modKey = isMac ? "Cmd" : "Ctrl";
export const altKey = isMac ? "Opt" : "Alt";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const NO_VALUE = "–";

export function formatPercent(ratio: number | null): string {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return NO_VALUE;
  return `${(ratio * 100).toFixed(1)}%`;
}
