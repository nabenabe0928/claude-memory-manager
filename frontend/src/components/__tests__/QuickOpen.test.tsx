import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QuickOpen } from "../QuickOpen";
import { makeTreeChild, makeTreeResponse } from "../../test-utils/factories";
import type { ComponentProps } from "react";

type QuickOpenProps = ComponentProps<typeof QuickOpen>;

const defaultTree = makeTreeResponse({
  children: [
    makeTreeChild({ name: "alpha-project", projectId: "p1", memoryCount: 2, sessionCount: 3 }),
    makeTreeChild({ name: "beta-tool", projectId: "p2", memoryCount: 0, sessionCount: 1 }),
    makeTreeChild({
      name: "shared",
      path: "/home/user/shared",
      isProject: false,
      projectId: null,
      projectPath: null,
      memoryCount: 0,
      sessionCount: 0,
      hasChildren: true,
    }),
  ],
});

function mockFetchTree(tree = defaultTree) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(tree),
    }),
  );
}

function renderQuickOpen(overrides: Partial<QuickOpenProps> = {}) {
  const props: QuickOpenProps = {
    onNavigateToMemories: vi.fn(),
    onNavigateToSessions: vi.fn(),
    onNavigateToMemory: vi.fn(),
    onNavigateToSession: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<QuickOpen {...props} />) };
}

beforeEach(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

describe("QuickOpen", () => {
  beforeEach(() => {
    mockFetchTree();
  });

  it("renders with a focused input", async () => {
    await act(async () => { renderQuickOpen(); });
    const input = screen.getByRole("textbox");
    expect(input).toHaveFocus();
  });

  it("shows 'Loading...' initially while fetching tree data", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {})),
    );
    renderQuickOpen();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows results after fetch resolves", async () => {
    await act(async () => { renderQuickOpen(); });

    expect(screen.getByText("alpha-project")).toBeInTheDocument();
    expect(screen.getByText("beta-tool")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    let props: QuickOpenProps;
    await act(async () => {
      ({ props } = renderQuickOpen());
    });

    await user.keyboard("{Escape}");
    expect(props!.onClose).toHaveBeenCalledOnce();
  });

  it("filters results by typing a query", async () => {
    const user = userEvent.setup();
    await act(async () => { renderQuickOpen(); });

    await user.type(screen.getByRole("textbox"), "alpha");

    // Text is split across <mark> and <span> due to HighlightedText
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("alpha-project");
  });

  it("moves selection down and up with arrow keys", async () => {
    const user = userEvent.setup();
    await act(async () => { renderQuickOpen(); });

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("quickopen-selected");

    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveClass("quickopen-selected");
    expect(items[0]).not.toHaveClass("quickopen-selected");

    await user.keyboard("{ArrowUp}");
    expect(items[0]).toHaveClass("quickopen-selected");
  });

  it("navigates via Enter on a selected project with only sessions", async () => {
    const tree = makeTreeResponse({
      children: [
        makeTreeChild({ name: "sess-only", projectId: "p-sess", memoryCount: 0, sessionCount: 4 }),
      ],
    });
    mockFetchTree(tree);

    const user = userEvent.setup();
    let props: QuickOpenProps;
    await act(async () => {
      ({ props } = renderQuickOpen());
    });

    await user.keyboard("{Enter}");
    expect(props!.onNavigateToSessions).toHaveBeenCalledOnce();
    expect(props!.onNavigateToSessions).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p-sess" }),
    );
  });

  it("shows 'No results' when filter matches nothing", async () => {
    const user = userEvent.setup();
    await act(async () => { renderQuickOpen(); });

    await user.type(screen.getByRole("textbox"), "zzzzzzz-no-match");

    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("calls onClose when clicking the overlay", async () => {
    const user = userEvent.setup();
    let props: QuickOpenProps;
    await act(async () => {
      ({ props } = renderQuickOpen());
    });

    const overlay = document.querySelector(".quickopen-overlay")!;
    await user.click(overlay);
    expect(props!.onClose).toHaveBeenCalledOnce();
  });
});
