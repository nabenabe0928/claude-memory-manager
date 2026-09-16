import type { CacheStats, CacheStatsAgent, CacheStatsTurn, PricingTable } from "./types";

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

export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1_000) return `${value}`;
  if (abs < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
  if (abs < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${(value / 1_000_000_000).toFixed(1)}B`;
}

// Triggers a browser "Save As" for in-memory data — no server round-trip.
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// turn.cacheCreation is a single aggregate number (not pre-split by TTL): classify the whole
// amount as a 5m or 1h write using turn.ttlS. A model missing from the pricing table is priced
// at $0 (all rates 0), not treated as an error.
export function turnCost(turn: CacheStatsTurn, pricing: PricingTable): number {
  const rates = pricing[turn.model];
  if (!rates) return 0;
  const writeRate = turn.ttlS === 3600 ? rates.oneHourWriteRate : rates.fiveMinWriteRate;
  return (
    (turn.uncached * rates.baseInputRate) / 1e6 +
    (turn.cacheCreation * writeRate) / 1e6 +
    (turn.cacheRead * rates.cacheReadRate) / 1e6 +
    (turn.output * rates.outputRate) / 1e6
  );
}

// Rounded down (never up) to the nearest $0.1, so the displayed figure never overstates cost.
// The `1e-9` nudge absorbs float error (e.g. 13.89 * 10 landing on 138.89999999999998) without
// affecting real boundary values.
export function formatCost(value: number): string {
  return `$${(Math.floor(value * 10 + 1e-9) / 10).toFixed(1)}`;
}

// meta.json may be missing or partial, so the id is the only label always available.
export function agentLabel(agent: CacheStatsAgent): string {
  const parts = [agent.agentType, agent.description].filter((part) => Boolean(part));
  return parts.length > 0 ? parts.join(" — ") : agent.agentId;
}

// A subagent is its own cache lifeline: its first turn is a legitimate "session start" miss and its
// hit rate is independent, so it gets a self-contained figure/table instead of joining the main ones.
// The first turn's model stands in for the whole run: subagents virtually never switch
// models mid-flight, and the collapsed row has room for one representative value only.
export function representativeModel(agent: CacheStatsAgent): string | null {
  return agent.turns[0]?.model ?? null;
}

export interface CacheStatsExportEntry {
  task: string;
  ttl: string;
  hit_rate: (number | null)[];
  read: number[];
  create: number[];
  input: number[];
  output: number[];
  gap: (number | null)[];
}

// ttlS is the observed TTL (300s or 3600s, see backend/cache_stats.py); a run never
// switches TTL mid-flight, so the first turn's value stands in for the whole entry.
function formatTtlLabel(ttlS: number): string {
  if (ttlS === 3600) return "1h";
  if (ttlS === 300) return "5m";
  return `${ttlS}s`;
}

function toExportEntry(task: string, turns: CacheStats["turns"]): CacheStatsExportEntry {
  return {
    task,
    ttl: formatTtlLabel(turns[0].ttlS),
    hit_rate: turns.map((turn) => turn.hitRate),
    read: turns.map((turn) => turn.cacheRead),
    create: turns.map((turn) => turn.cacheCreation),
    input: turns.map((turn) => turn.uncached),
    output: turns.map((turn) => turn.output),
    gap: turns.map((turn) => turn.gapS),
  };
}

// Two subagents can share both a model and a task label, so a bare "role-model" key can collide;
// suffix it to keep every entry in the export.
function uniqueExportKey(base: string, usedKeys: Set<string>): string {
  let key = base;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}-${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

export function buildCacheStatsExport(stats: CacheStats): Record<string, CacheStatsExportEntry> {
  const result: Record<string, CacheStatsExportEntry> = {};
  const usedKeys = new Set<string>();
  if (stats.turns.length > 0) {
    const model = stats.turns[0].model;
    result[uniqueExportKey(`main-${model}`, usedKeys)] = toExportEntry("main", stats.turns);
  }
  for (const agent of stats.subagents) {
    if (agent.turns.length === 0) continue;
    const model = representativeModel(agent) ?? "unknown-model";
    result[uniqueExportKey(`sub-${model}`, usedKeys)] = toExportEntry(agentLabel(agent), agent.turns);
  }
  return result;
}

function slugifyForFilename(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstWords(text: string, count: number): string {
  return text.trim().split(/\s+/).slice(0, count).join(" ");
}

export function cacheStatsFilename(projectName: string, sessionSummary: string): string {
  const parts = [
    "cache-stats",
    slugifyForFilename(projectName),
    slugifyForFilename(firstWords(sessionSummary, 3)),
  ].filter(Boolean);
  return `${parts.join("-")}.json`;
}
