import { describe, it, expect } from "vitest";
import {
  buildCacheStatsExport,
  cacheStatsFilename,
  formatCompactNumber,
  formatPercent,
  formatSize,
  NO_VALUE,
} from "../utils";
import { makeCacheStats, makeCacheStatsAgent, makeCacheStatsTurn } from "../test-utils/factories";

describe("formatSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1025, "1.0 KB"],
    [1024 * 512, "512.0 KB"],
    [1024 * 1024 - 1, "1024.0 KB"],
    [1024 * 1024, "1.0 MB"],
    [1024 * 1024 + 1, "1.0 MB"],
    [5.5 * 1024 * 1024, "5.5 MB"],
    [1024 * 1024 * 1024, "1024.0 MB"],
  ] as [number, string][])(
    "returns %j for %d bytes",
    (bytes, expected) => {
      expect(formatSize(bytes)).toBe(expected);
    },
  );
});

describe("formatPercent", () => {
  it.each([
    [0, "0.0%"],
    [0.9737, "97.4%"],
    [0.5, "50.0%"],
    [1, "100.0%"],
    [0.00004, "0.0%"],
  ] as [number, string][])(
    "returns %j for %j",
    (ratio, expected) => {
      expect(formatPercent(ratio)).toBe(expected);
    },
  );

  it("returns the placeholder for null", () => {
    expect(formatPercent(null)).toBe(NO_VALUE);
  });

  it("returns the placeholder for non-finite values", () => {
    expect(formatPercent(NaN)).toBe(NO_VALUE);
    expect(formatPercent(Infinity)).toBe(NO_VALUE);
  });
});

describe("formatCompactNumber", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1.0K"],
    [96246, "96.2K"],
    [999_999, "1000.0K"],
    [1_000_000, "1.0M"],
    [1_234_567, "1.2M"],
    [1_000_000_000, "1.0B"],
    [1_500_000_000, "1.5B"],
    [-96246, "-96.2K"],
  ] as [number, string][])(
    "returns %j for %d",
    (value, expected) => {
      expect(formatCompactNumber(value)).toBe(expected);
    },
  );
});

describe("buildCacheStatsExport", () => {
  it("builds a main entry keyed by the first turn's model, with per-turn arrays in order", () => {
    const turns = [
      makeCacheStatsTurn({
        model: "claude-sonnet-4",
        hitRate: null,
        cacheRead: 0,
        cacheCreation: 900,
        gapS: null,
      }),
      makeCacheStatsTurn({
        model: "claude-sonnet-4",
        hitRate: 0.5,
        cacheRead: 200,
        cacheCreation: 20,
        gapS: 3,
      }),
    ];
    const stats = makeCacheStats({ turns, subagents: [] });

    const result = buildCacheStatsExport(stats);

    expect(Object.keys(result)).toEqual(["main-claude-sonnet-4"]);
    expect(result["main-claude-sonnet-4"]).toEqual({
      task: "main",
      hit_rate: [null, 0.5],
      read: [0, 200],
      create: [900, 20],
      input: [0, 0],
      output: [500, 500],
      gap: [null, 3],
    });
  });

  it("adds one sub entry per agent with turns, keyed by representative model and labeled with agentLabel", () => {
    const agent = makeCacheStatsAgent({
      agentType: "python-style-reviewer",
      description: "Review backend Python style",
      turns: [
        makeCacheStatsTurn({
          model: "claude-opus-4",
          hitRate: 0.8,
          cacheRead: 50,
          cacheCreation: 5,
          gapS: 1,
        }),
      ],
    });
    const stats = makeCacheStats({
      turns: [makeCacheStatsTurn({ model: "claude-sonnet-4" })],
      subagents: [agent],
    });

    const result = buildCacheStatsExport(stats);

    expect(Object.keys(result)).toEqual(["main-claude-sonnet-4", "sub-claude-opus-4"]);
    expect(result["sub-claude-opus-4"]).toEqual({
      task: "python-style-reviewer — Review backend Python style",
      hit_rate: [0.8],
      read: [50],
      create: [5],
      input: [0],
      output: [500],
      gap: [1],
    });
  });

  it("skips a subagent with zero turns entirely", () => {
    const emptyAgent = makeCacheStatsAgent({ turns: [] });
    const stats = makeCacheStats({
      turns: [makeCacheStatsTurn({ model: "claude-sonnet-4" })],
      subagents: [emptyAgent],
    });

    const result = buildCacheStatsExport(stats);

    expect(Object.keys(result)).toEqual(["main-claude-sonnet-4"]);
  });

  it("omits the main entry when there are no main turns", () => {
    const agent = makeCacheStatsAgent({ turns: [makeCacheStatsTurn({ model: "claude-opus-4" })] });
    const stats = makeCacheStats({ turns: [], subagents: [agent] });

    const result = buildCacheStatsExport(stats);

    expect(Object.keys(result)).toEqual(["sub-claude-opus-4"]);
  });

  it("suffixes colliding sub-entry keys instead of overwriting an earlier entry", () => {
    const makeReviewer = (agentId: string) =>
      makeCacheStatsAgent({
        agentId,
        agentType: "reviewer",
        description: "Review code",
        turns: [makeCacheStatsTurn({ model: "claude-sonnet-4" })],
      });
    const stats = makeCacheStats({
      turns: [],
      subagents: [makeReviewer("agent-a"), makeReviewer("agent-b"), makeReviewer("agent-c")],
    });

    const result = buildCacheStatsExport(stats);

    expect(Object.keys(result)).toEqual([
      "sub-claude-sonnet-4",
      "sub-claude-sonnet-4-2",
      "sub-claude-sonnet-4-3",
    ]);
    expect(result["sub-claude-sonnet-4"].task).toBe("reviewer — Review code");
    expect(result["sub-claude-sonnet-4-2"].task).toBe("reviewer — Review code");
    expect(result["sub-claude-sonnet-4-3"].task).toBe("reviewer — Review code");
  });
});

describe("cacheStatsFilename", () => {
  it("prefixes cache-stats, then the project name, then the first three words of the summary", () => {
    expect(cacheStatsFilename("My Project", "Fix the login bug end to end")).toBe(
      "cache-stats-my-project-fix-the-login.json",
    );
  });

  it("slugifies punctuation and collapses repeated separators", () => {
    expect(cacheStatsFilename("claude-memory-manager", "Add: cache stats, download!")).toBe(
      "cache-stats-claude-memory-manager-add-cache-stats.json",
    );
  });

  it("drops the project segment when the project name is empty", () => {
    expect(cacheStatsFilename("", "Fix the login bug")).toBe("cache-stats-fix-the-login.json");
  });

  it("drops the summary segment when the summary is empty", () => {
    expect(cacheStatsFilename("My Project", "")).toBe("cache-stats-my-project.json");
  });

  it("falls back to cache-stats.json when both inputs are empty", () => {
    expect(cacheStatsFilename("", "")).toBe("cache-stats.json");
  });
});
