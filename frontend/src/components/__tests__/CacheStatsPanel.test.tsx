import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CacheStatsPanel } from "../CacheStatsPanel";
import { buildCacheStatsExport, cacheStatsFilename } from "../../utils";
import { makeCacheStats, makeCacheStatsAgent, makeCacheStatsTurn } from "../../test-utils/factories";

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
    render(<CacheStatsPanel stats={makeCacheStats()} projectName="My Project" sessionSummary="Fix the login bug" />);
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeInTheDocument();
  });

  it("downloads the cache stats export as <project>-<summary words>.json when clicked", async () => {
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
});
