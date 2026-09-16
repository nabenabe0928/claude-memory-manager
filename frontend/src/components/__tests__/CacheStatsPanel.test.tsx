import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CacheStatsPanel } from "../CacheStatsPanel";
import { buildCacheStatsExport, cacheStatsFilename } from "../../utils";
import { makeCacheStats, makeCacheStatsAgent, makeCacheStatsTurn } from "../../test-utils/factories";
import type { PricingTable } from "../../types";

// CacheStatsPanel fetches /api/pricing on mount; every test needs this mocked, empty pricing
// unless a test cares about the resulting cost values.
function mockFetchWith(pricing: PricingTable) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    json: () => Promise.resolve(pricing),
  } as Response);
}

// downloadJson (utils.ts) drives raw browser APIs with no observable return value, so the
// download is verified the same way the rest of this codebase spies on browser APIs
// (see navigator.clipboard in useKeyboardShortcuts.test.tsx) rather than mocking the module.
function mockDownload() {
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  let createdAnchor: HTMLAnchorElement | null = null;
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
    const element = createElement(tagName);
    if (tagName === "a") createdAnchor = element as HTMLAnchorElement;
    return element;
  });
  return {
    createObjectURL,
    revokeObjectURL,
    anchor: () => createdAnchor,
  };
}

describe("CacheStatsPanel", () => {
  it("renders a Download JSON button", () => {
    mockFetchWith({});
    render(<CacheStatsPanel stats={makeCacheStats()} projectName="My Project" sessionSummary="Fix the login bug" />);
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeInTheDocument();
  });

  it("downloads the cache stats export as <project>-<summary words>.json when clicked", async () => {
    mockFetchWith({});
    const { createObjectURL, revokeObjectURL, anchor } = mockDownload();
    const user = userEvent.setup();
    const stats = makeCacheStats({
      turns: [makeCacheStatsTurn({ model: "claude-sonnet-4" })],
      subagents: [makeCacheStatsAgent()],
    });
    const projectName = "My Project";
    const sessionSummary = "Fix the login bug end to end";
    render(<CacheStatsPanel stats={stats} projectName={projectName} sessionSummary={sessionSummary} />);

    await user.click(screen.getByRole("button", { name: "Download JSON" }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchor()?.download).toBe(cacheStatsFilename(projectName, sessionSummary));

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const payload = JSON.parse(await blob.text());
    expect(payload).toEqual(buildCacheStatsExport(stats));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  describe("cost column", () => {
    // Only cacheRead is priced (rate 1) so each turn's cost is its cacheRead / 1e6, in round dollars.
    const pricing: PricingTable = {
      "claude-sonnet-4": {
        baseInputRate: 0,
        fiveMinWriteRate: 0,
        oneHourWriteRate: 0,
        cacheReadRate: 1,
        outputRate: 0,
      },
      "claude-opus-4": {
        baseInputRate: 0,
        fiveMinWriteRate: 0,
        oneHourWriteRate: 0,
        cacheReadRate: 1,
        outputRate: 0,
      },
    };

    function costCells(table: HTMLElement): string[] {
      return within(table)
        .getAllByRole("row")
        .slice(1) // drop the header row
        .map((row) => within(row).getAllByRole("cell")[6].textContent);
    }

    it("shows the running cumulative cost per row, independently for the main table and a subagent's table", async () => {
      mockFetchWith(pricing);
      const user = userEvent.setup();
      const mainTurns = [
        makeCacheStatsTurn({ model: "claude-sonnet-4", cacheRead: 1_000_000, cacheCreation: 0, uncached: 0, output: 0 }),
        makeCacheStatsTurn({ model: "claude-sonnet-4", cacheRead: 2_000_000, cacheCreation: 0, uncached: 0, output: 0 }),
      ];
      const agent = makeCacheStatsAgent({
        turns: [
          makeCacheStatsTurn({ model: "claude-opus-4", cacheRead: 5_000_000, cacheCreation: 0, uncached: 0, output: 0 }),
        ],
      });
      const stats = makeCacheStats({ turns: mainTurns, subagents: [agent] });
      render(<CacheStatsPanel stats={stats} projectName="My Project" sessionSummary="Fix the login bug" />);

      // Wait for the /api/pricing fetch to resolve and the main table to reflect it.
      await screen.findByText("$1.0");

      expect(screen.getByText("Total Cost: $8.0 (Session), $3.0 (Main Agent)")).toBeInTheDocument();

      const agentToggle = screen.getByRole("button", { name: /python-style-reviewer/ });
      expect(within(agentToggle).getByText("$5.0")).toBeInTheDocument();
      await user.click(agentToggle);

      const [mainTable, subagentTable] = screen.getAllByRole("table");
      expect(costCells(mainTable)).toEqual(["$1.0", "$3.0"]);
      expect(costCells(subagentTable)).toEqual(["$5.0"]);
    });
  });

  describe("pricing editor", () => {
    it("shows a popup once saving pricing succeeds", async () => {
      const savedPricing: PricingTable = {
        "claude-sonnet-4": {
          baseInputRate: 3,
          fiveMinWriteRate: 3.75,
          oneHourWriteRate: 6,
          cacheReadRate: 0.3,
          outputRate: 15,
        },
      };
      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = typeof input === "string" ? input : input.toString();
        const body = url === "/api/pricing" ? {} : savedPricing;
        return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
      });
      const onToast = vi.fn();
      const user = userEvent.setup();
      const stats = makeCacheStats({ turns: [makeCacheStatsTurn({ model: "claude-sonnet-4" })] });
      render(
        <CacheStatsPanel
          stats={stats}
          projectName="My Project"
          sessionSummary="Fix the login bug"
          onToast={onToast}
        />,
      );

      await user.click(screen.getByRole("button", { name: /Update Claude pricing/ }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onToast).toHaveBeenCalledWith("Pricing saved!"));
    });
  });
});
