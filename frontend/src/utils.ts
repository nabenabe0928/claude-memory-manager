export const isMac = navigator.platform.toUpperCase().includes("MAC");
export const modKey = isMac ? "Cmd" : "Ctrl";
export const altKey = isMac ? "Opt" : "Alt";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
