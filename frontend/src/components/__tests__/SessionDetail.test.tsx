import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockInstance } from "vitest";
import { SessionDetail } from "../SessionDetail";
import {
  makeCacheStats,
  makeCacheStatsAgent,
  makeCacheStatsSession,
  makeCacheStatsTurn,
  makeSession,
} from "../../test-utils/factories";

function mockFetchPending() {
  return vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
}

// Routes the cache-stats endpoint separately from the messages endpoint.
// The cacheStats argument may be an Error to simulate a failed request.
function mockFetchRouted(messages: unknown, cacheStats: unknown): MockInstance<typeof fetch> {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    if (String(input).endsWith("/cache-stats")) {
      if (cacheStats instanceof Error) return Promise.reject(cacheStats);
      return Promise.resolve({ json: () => Promise.resolve(cacheStats) } as Response);
    }
    return Promise.resolve({ json: () => Promise.resolve(messages) } as Response);
  });
}

function mockFetchWith(data: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    json: () => Promise.resolve(data),
  } as Response);
}

const defaultMessages = [
  {
    role: "user",
    lineIndex: 0,
    parts: [{ type: "text" as const, text: "Hello there" }],
  },
  {
    role: "assistant",
    lineIndex: 1,
    parts: [{ type: "text" as const, text: "Hi! How can I help?" }],
  },
];

function renderDetail(overrides: {
  session?: ReturnType<typeof makeSession>;
  projectId?: string;
  projectDisplayName?: string;
  onBack?: () => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
} = {}) {
  const props = {
    session: makeSession(),
    projectId: "proj-1",
    projectDisplayName: "~/my-project",
    onBack: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<SessionDetail {...props} />) };
}

describe("SessionDetail", () => {
  describe("loading and data states", () => {
    it("shows loading state initially", () => {
      mockFetchPending();
      renderDetail();
      expect(screen.getByText("Loading conversation...")).toBeInTheDocument();
    });

    it("renders messages after loading", async () => {
      mockFetchWith(defaultMessages);
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });
      expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
    });

    it("shows empty state when no messages returned", async () => {
      mockFetchWith([]);
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("No messages found in this session.")).toBeInTheDocument();
      });
    });
  });

  it("displays truncated session id in heading", () => {
    mockFetchPending();
    renderDetail({ session: makeSession({ id: "abcdefgh-1234" }) });
    expect(screen.getByRole("heading", { name: /abcdefg/i })).toBeInTheDocument();
  });

  it("calls the correct API endpoint", () => {
    const fetchSpy = mockFetchPending();
    renderDetail({
      session: makeSession({ id: "session-id-123" }),
      projectId: "my-project",
    });
    expect(fetchSpy).toHaveBeenCalledWith("/api/projects/my-project/sessions/session-id-123");
  });

  describe("back button", () => {
    it("calls onBack when clicked", async () => {
      mockFetchPending();
      const user = userEvent.setup();
      const onBack = vi.fn();
      renderDetail({ onBack });

      await user.click(screen.getByRole("button", { name: /back to sessions/i }));
      expect(onBack).toHaveBeenCalledOnce();
    });
  });

  describe("delete flow", () => {
    beforeEach(() => {
      mockFetchPending();
    });

    it("shows confirmation dialog when Delete button is clicked", async () => {
      const user = userEvent.setup();
      renderDetail();

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it("calls onDelete with session id when confirmed", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      renderDetail({ session: makeSession({ id: "del-this" }), onDelete });

      await user.click(screen.getByRole("button", { name: "Delete" }));
      const confirmButtons = screen.getAllByRole("button", { name: "Delete" });
      await user.click(confirmButtons[confirmButtons.length - 1]);
      expect(onDelete).toHaveBeenCalledWith("del-this");
    });
  });

  describe("collapsible parts", () => {
    const toolMessages = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool_use" as const,
            label: "Read file.ts",
            detail: "file contents here",
          },
        ],
      },
    ];

    it("renders tool_use parts collapsed by default", async () => {
      mockFetchWith(toolMessages);
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Read file.ts")).toBeInTheDocument();
      });
      expect(screen.queryByText("file contents here")).not.toBeInTheDocument();
    });

    it("expands tool_use part detail when clicked", async () => {
      mockFetchWith(toolMessages);
      const user = userEvent.setup();
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Read file.ts")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Read file.ts"));
      expect(screen.getByText("file contents here")).toBeInTheDocument();
    });
  });

  describe("copy resume command", () => {
    it("shows copied feedback after clicking", async () => {
      mockFetchPending();
      const user = userEvent.setup();
      renderDetail({ session: makeSession({ id: "resume-id" }) });

      await user.click(screen.getByRole("button", { name: /copy resume/i }));
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  describe("markdown toggle", () => {
    const markdownMessages = [
      {
        role: "assistant",
        lineIndex: 0,
        parts: [{ type: "text" as const, text: "# Heading\n\nSome **bold** text" }],
      },
    ];

    it("shows MD button on messages with text parts", async () => {
      mockFetchWith(defaultMessages);
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });

      const mdButtons = screen.getAllByRole("button", { name: "MD" });
      expect(mdButtons).toHaveLength(2);
    });

    it("shows MD button on messages with tool parts that have detail", async () => {
      const toolOnlyMessages = [
        {
          role: "assistant",
          lineIndex: 0,
          parts: [{ type: "tool_use" as const, label: "Read file", detail: "contents" }],
        },
      ];
      mockFetchWith(toolOnlyMessages);
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Read file")).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: "MD" })).toBeInTheDocument();
    });

    it("renders markdown by default", async () => {
      mockFetchWith(markdownMessages);
      renderDetail();

      await waitFor(() => {
        expect(document.querySelector(".markdown-body")).toBeInTheDocument();
      });

      expect(document.querySelector(".message-text")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
    });

    it("renders raw text when MD button is clicked", async () => {
      mockFetchWith(markdownMessages);
      const user = userEvent.setup();
      renderDetail();

      await waitFor(() => {
        expect(document.querySelector(".markdown-body")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: "MD" }));

      const pre = document.querySelector(".message-text");
      expect(pre).toBeInTheDocument();
      expect(pre?.tagName).toBe("PRE");
      expect(document.querySelector(".markdown-body")).not.toBeInTheDocument();
    });

    it("toggles back to markdown on second click", async () => {
      mockFetchWith(markdownMessages);
      const user = userEvent.setup();
      renderDetail();

      await waitFor(() => {
        expect(document.querySelector(".markdown-body")).toBeInTheDocument();
      });

      const mdButton = screen.getByRole("button", { name: "MD" });
      await user.click(mdButton);
      expect(document.querySelector(".markdown-body")).not.toBeInTheDocument();
      expect(document.querySelector(".message-text")).toBeInTheDocument();

      await user.click(mdButton);
      expect(document.querySelector(".markdown-body")).toBeInTheDocument();
      expect(document.querySelector(".message-text")).not.toBeInTheDocument();
    });

    it("toggles messages independently", async () => {
      mockFetchWith(defaultMessages);
      const user = userEvent.setup();
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });

      const mdButtons = screen.getAllByRole("button", { name: "MD" });
      await user.click(mdButtons[0]);

      const messages = document.querySelectorAll(".message");
      expect(messages[0].querySelector(".markdown-body")).not.toBeInTheDocument();
      expect(messages[1].querySelector(".markdown-body")).toBeInTheDocument();
    });

    it("has active class on MD button by default and removes on click", async () => {
      mockFetchWith(defaultMessages);
      const user = userEvent.setup();
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });

      const mdButton = screen.getAllByRole("button", { name: "MD" })[0];
      expect(mdButton.className).toContain("md-btn-active");

      await user.click(mdButton);
      expect(mdButton.className).not.toContain("md-btn-active");
    });
  });

  describe("message delete flow", () => {
    it("shows delete button on each message", async () => {
      mockFetchWith(defaultMessages);
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });

      const messageBubbles = document.querySelectorAll(".message-actions");
      expect(messageBubbles).toHaveLength(2);
      messageBubbles.forEach((actions) => {
        expect(within(actions as HTMLElement).getByRole("button", { name: "Delete" })).toBeInTheDocument();
      });
    });

    it("shows confirmation dialog when message delete is clicked", async () => {
      mockFetchWith(defaultMessages);
      const user = userEvent.setup();
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });

      const firstMessageActions = document.querySelectorAll(".message-actions")[0] as HTMLElement;
      await user.click(within(firstMessageActions).getByRole("button", { name: "Delete" }));

      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it("calls delete API and re-fetches messages on confirm", async () => {
      const fetchSpy = mockFetchWith(defaultMessages);
      const user = userEvent.setup();
      renderDetail({ projectId: "proj-1", session: makeSession({ id: "sess-1" }) });

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });

      const remainingMessages = [defaultMessages[1]];
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response)
        .mockResolvedValueOnce({
          json: () => Promise.resolve(remainingMessages),
        } as Response);

      const firstMessageActions = document.querySelectorAll(".message-actions")[0] as HTMLElement;
      await user.click(within(firstMessageActions).getByRole("button", { name: "Delete" }));

      const dialog = document.querySelector(".dialog") as HTMLElement;
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(screen.queryByText("Hello there")).not.toBeInTheDocument();
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/projects/proj-1/sessions/sess-1/messages/0",
        { method: "DELETE" },
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/projects/proj-1/sessions/sess-1",
      );
      expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
    });

    it("dismisses dialog on cancel without deleting", async () => {
      mockFetchWith(defaultMessages);
      const user = userEvent.setup();
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });

      const firstMessageActions = document.querySelectorAll(".message-actions")[0] as HTMLElement;
      await user.click(within(firstMessageActions).getByRole("button", { name: "Delete" }));

      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
      expect(screen.getByText("Hello there")).toBeInTheDocument();
      expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
    });
  });

  describe("cache hit rate", () => {
    it("requests the cache-stats endpoint for the session", async () => {
      const fetchSpy = mockFetchRouted(defaultMessages, makeCacheStats());
      renderDetail({ projectId: "my-project", session: makeSession({ id: "session-id-123" }) });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/projects/my-project/sessions/session-id-123/cache-stats",
        );
      });
    });

    it("renders the session hit rate in the meta line", async () => {
      mockFetchRouted(defaultMessages, makeCacheStats());
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Cache hit rate: 97.4%")).toBeInTheDocument();
      });
      const meta = document.querySelector(".session-detail-meta") as HTMLElement;
      expect(within(meta).getByText("Cache hit rate: 97.4%")).toBeInTheDocument();
    });

    it("shows a placeholder when the hit rate is null", async () => {
      mockFetchRouted(
        defaultMessages,
        makeCacheStats({ session: makeCacheStatsSession({ hitRate: null }) }),
      );
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });
      expect(screen.getByText(/Cache hit rate:/)).toBeInTheDocument();
      expect(screen.queryByText(/Cache hit rate: \d/)).not.toBeInTheDocument();
    });

    it("omits the hit rate and still renders messages when the fetch fails", async () => {
      mockFetchRouted(defaultMessages, new Error("network down"));
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });
      expect(screen.queryByText(/Cache hit rate/)).not.toBeInTheDocument();
    });

    it("omits the hit rate when the payload does not match the contract", async () => {
      mockFetchRouted(defaultMessages, { error: "not found" });
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });
      expect(screen.queryByText(/Cache hit rate/)).not.toBeInTheDocument();
    });

    it("re-fetches cache stats on refresh", async () => {
      const fetchSpy = mockFetchRouted(defaultMessages, makeCacheStats());
      const user = userEvent.setup();
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Cache hit rate: 97.4%")).toBeInTheDocument();
      });
      const before = fetchSpy.mock.calls.filter(
        ([url]) => String(url).endsWith("/cache-stats"),
      ).length;

      await user.click(screen.getByRole("button", { name: /refresh/i }));

      await waitFor(() => {
        const after = fetchSpy.mock.calls.filter(
          ([url]) => String(url).endsWith("/cache-stats"),
        ).length;
        expect(after).toBeGreaterThan(before);
      });
    });
  });

  describe("cache stats panel", () => {
    // Turn 1: no hit rate yet (skipped in the figure), turn 2: normal append,
    // turn 3: a cache miss attributed to TTL expiry.
    const mixedTurns = [
      makeCacheStatsTurn({
        cause: "session start",
        hitRate: null,
        cacheRead: 0,
        cacheCreation: 9000,
        gapS: null,
      }),
      makeCacheStatsTurn({ cause: "-", hitRate: 0.9737 }),
      makeCacheStatsTurn({
        cause: "TTL expiry",
        hitRate: 0.432,
        cacheRead: 1234,
        cacheCreation: 56,
        gapS: 3700.5,
        ttlS: 3600,
        model: "claude-opus-4",
      }),
    ];

    function statsWithTurns(turns: ReturnType<typeof makeCacheStatsTurn>[]) {
      return makeCacheStats({
        turns,
        session: makeCacheStatsSession({ turnCount: turns.length }),
      });
    }

    function queryCachePanel() {
      return screen.queryByRole("region", { name: "Per-turn cache stats" });
    }

    function pressAltC(target: Document | HTMLElement = document) {
      fireEvent.keyDown(target, { code: "KeyC", altKey: true });
    }

    // Renders the detail view with successfully loading cache stats and waits
    // for the toggle button (only rendered once the stats are parsed) to appear.
    async function renderWithCacheStats(stats: unknown = makeCacheStats()) {
      mockFetchRouted(defaultMessages, stats);
      const user = userEvent.setup();
      renderDetail();
      const toggle = await screen.findByRole("button", { name: "Cache stats" });
      return { user, toggle };
    }

    it("keeps the panel hidden by default even when cache stats load", async () => {
      await renderWithCacheStats(statsWithTurns(mixedTurns));

      expect(queryCachePanel()).not.toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("reveals figure and table on button click and hides them on a second click", async () => {
      const { user, toggle } = await renderWithCacheStats(statsWithTurns(mixedTurns));

      await user.click(toggle);
      const panel = queryCachePanel() as HTMLElement;
      expect(panel).toBeInTheDocument();
      expect(within(panel).getByRole("table")).toBeInTheDocument();
      expect(within(panel).getByRole("img")).toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-expanded", "true");

      await user.click(toggle);
      expect(queryCachePanel()).not.toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    it("toggles the panel open and closed with Alt+C", async () => {
      await renderWithCacheStats();

      pressAltC();
      expect(queryCachePanel()).toBeInTheDocument();

      pressAltC();
      expect(queryCachePanel()).not.toBeInTheDocument();
    });

    it("ignores Alt+C when focus is in an editable target", async () => {
      await renderWithCacheStats();
      const input = document.createElement("input");
      document.body.appendChild(input);

      try {
        pressAltC(input);
        expect(queryCachePanel()).not.toBeInTheDocument();
      } finally {
        input.remove();
      }
    });

    it("renders one table row per turn with the turn's values", async () => {
      const { user, toggle } = await renderWithCacheStats(statsWithTurns(mixedTurns));
      await user.click(toggle);

      const table = within(queryCachePanel() as HTMLElement).getByRole("table");
      const bodyRows = within(table).getAllByRole("row").slice(1);
      expect(bodyRows).toHaveLength(mixedTurns.length);

      const cellTexts = (row: HTMLElement) =>
        within(row).getAllByRole("cell").map((cell) => cell.textContent);
      expect(cellTexts(bodyRows[0])).toEqual(
        ["1", "–", "0", "9000", "–", "300", "claude-sonnet-4", "session start"],
      );
      expect(cellTexts(bodyRows[2])).toEqual(
        ["3", "43.2%", "1234", "56", "3700.5", "3600", "claude-opus-4", "TTL expiry"],
      );
    });

    it("highlights only miss-cause rows in the table", async () => {
      const { user, toggle } = await renderWithCacheStats(statsWithTurns(mixedTurns));
      await user.click(toggle);

      const table = within(queryCachePanel() as HTMLElement).getByRole("table");
      const bodyRows = within(table).getAllByRole("row").slice(1);
      expect(bodyRows[0].className).not.toContain("cache-turn-miss");
      expect(bodyRows[1].className).not.toContain("cache-turn-miss");
      expect(bodyRows[2].className).toContain("cache-turn-miss");
    });

    it("skips a null-hitRate turn in the figure instead of plotting it", async () => {
      const { user, toggle } = await renderWithCacheStats(statsWithTurns(mixedTurns));
      await user.click(toggle);

      expect(screen.getByRole("img", {
        name: "Cache hit rate by turn: 2 of 3 turns plotted, 1 cache-miss turn marked.",
      })).toBeInTheDocument();
    });

    it("labels each miss marker in the figure with turn, cause, and hit rate", async () => {
      const { user, toggle } = await renderWithCacheStats(statsWithTurns(mixedTurns));
      await user.click(toggle);

      const figure = within(queryCachePanel() as HTMLElement).getByRole("img");
      const markers = figure.querySelectorAll(".cache-miss-marker");
      expect(markers).toHaveLength(1);
      expect(markers[0].querySelector("title")?.textContent).toBe(
        "Turn 3 — TTL expiry — 43.2%",
      );
    });

    it("closes the panel and stays hidden after switching to another session", async () => {
      mockFetchRouted(defaultMessages, statsWithTurns(mixedTurns));
      const user = userEvent.setup();
      const { props, rerender } = renderDetail();
      const toggle = await screen.findByRole("button", { name: "Cache stats" });
      await user.click(toggle);
      expect(queryCachePanel()).toBeInTheDocument();

      rerender(<SessionDetail {...props} session={makeSession({ id: "next-session-id" })} />);

      expect(queryCachePanel()).not.toBeInTheDocument();
      const newToggle = await screen.findByRole("button", { name: "Cache stats" });
      expect(newToggle).toHaveAttribute("aria-expanded", "false");
      expect(queryCachePanel()).not.toBeInTheDocument();
    });

    it("renders no toggle button or panel when the cache-stats fetch fails", async () => {
      mockFetchRouted(defaultMessages, new Error("network down"));
      renderDetail();

      await waitFor(() => {
        expect(screen.getByText("Hello there")).toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: "Cache stats" })).not.toBeInTheDocument();
      expect(queryCachePanel()).not.toBeInTheDocument();
    });

    describe("subagent sections", () => {
      const agents = [
        makeCacheStatsAgent(),
        makeCacheStatsAgent({
          agentId: "b17c22d9e4f01",
          agentType: "ts-test-writer",
          description: "Write frontend tests",
          turns: mixedTurns,
          session: makeCacheStatsSession({ turnCount: mixedTurns.length, hitRate: 0.5 }),
        }),
      ];

      async function openPanel(stats: unknown) {
        const { user, toggle } = await renderWithCacheStats(stats);
        await user.click(toggle);
        return { user, panel: queryCachePanel() as HTMLElement };
      }

      function agentSections(panel: HTMLElement) {
        return panel.querySelectorAll(".cache-agent");
      }

      it("renders one section per subagent, labeled with type, description, and hit rate", async () => {
        const { panel } = await openPanel({ ...statsWithTurns(mixedTurns), subagents: agents });

        expect(agentSections(panel)).toHaveLength(2);
        const styleReviewer = within(panel).getByRole("button", {
          name: /python-style-reviewer — Review backend Python style/,
        });
        expect(styleReviewer).toHaveTextContent("97.4%");
        expect(
          within(panel).getByRole("button", { name: /ts-test-writer — Write frontend tests/ }),
        ).toHaveTextContent("50.0%");
      });

      it("falls back to the agent id when the type and description are null", async () => {
        const anonymous = makeCacheStatsAgent({ agentType: null, description: null });
        const { panel } = await openPanel({
          ...statsWithTurns(mixedTurns),
          subagents: [anonymous],
        });

        expect(
          within(panel).getByRole("button", { name: new RegExp(anonymous.agentId) }),
        ).toBeInTheDocument();
      });

      it("keeps each section collapsed until clicked and collapses it again on a second click", async () => {
        const { user, panel } = await openPanel({
          ...statsWithTurns(mixedTurns),
          subagents: [agents[1]],
        });

        // Only the main session's figure and table exist while the section is collapsed.
        const section = within(panel).getByRole("button", { name: /ts-test-writer/ });
        expect(section).toHaveAttribute("aria-expanded", "false");
        expect(within(panel).getAllByRole("table")).toHaveLength(1);
        expect(within(panel).getAllByRole("img")).toHaveLength(1);

        await user.click(section);

        expect(section).toHaveAttribute("aria-expanded", "true");
        expect(within(panel).getAllByRole("table")).toHaveLength(2);
        expect(within(panel).getAllByRole("img")).toHaveLength(2);
        const bodyId = section.getAttribute("aria-controls") as string;
        expect(document.getElementById(bodyId)).toBeInTheDocument();

        await user.click(section);

        expect(section).toHaveAttribute("aria-expanded", "false");
        expect(within(panel).getAllByRole("table")).toHaveLength(1);
        expect(document.getElementById(bodyId)).not.toBeInTheDocument();
      });

      it("tabulates the agent's own turns without touching the main table", async () => {
        const shortAgent = makeCacheStatsAgent({
          turns: [makeCacheStatsTurn({ cause: "session start", hitRate: null })],
        });
        const { user, panel } = await openPanel({
          ...statsWithTurns(mixedTurns),
          subagents: [shortAgent],
        });
        await user.click(within(panel).getByRole("button", { name: /python-style-reviewer/ }));

        const [mainTable, agentTable] = within(panel).getAllByRole("table");
        expect(within(mainTable).getAllByRole("row")).toHaveLength(mixedTurns.length + 1);
        expect(within(agentTable).getAllByRole("row")).toHaveLength(2);
      });

      it("leaves the main figure and session hit rate unchanged by the subagents", async () => {
        const { panel } = await openPanel({ ...statsWithTurns(mixedTurns), subagents: agents });

        expect(within(panel).getByRole("img", {
          name: "Cache hit rate by turn: 2 of 3 turns plotted, 1 cache-miss turn marked.",
        })).toBeInTheDocument();
        const meta = document.querySelector(".session-detail-meta") as HTMLElement;
        expect(within(meta).getByText("Cache hit rate: 97.4%")).toBeInTheDocument();
      });

      it("renders the panel as before when the payload has no subagents field", async () => {
        // An older or degraded backend omits the field entirely.
        const { panel } = await openPanel({
          turns: mixedTurns,
          session: makeCacheStatsSession({ turnCount: mixedTurns.length }),
          skipped: 0,
        });

        expect(agentSections(panel)).toHaveLength(0);
        expect(within(panel).queryByText(/Subagents/)).not.toBeInTheDocument();
        expect(within(panel).getAllByRole("table")).toHaveLength(1);
      });

      it("renders no section when the subagent list is empty", async () => {
        const { panel } = await openPanel(statsWithTurns(mixedTurns));

        expect(agentSections(panel)).toHaveLength(0);
        expect(within(panel).queryByText(/Subagents/)).not.toBeInTheDocument();
      });

      it("rejects the whole payload when a subagent entry breaks the contract", async () => {
        mockFetchRouted(defaultMessages, {
          ...statsWithTurns(mixedTurns),
          subagents: [{ agentId: 7 }],
        });
        renderDetail();

        await waitFor(() => {
          expect(screen.getByText("Hello there")).toBeInTheDocument();
        });
        expect(screen.queryByRole("button", { name: "Cache stats" })).not.toBeInTheDocument();
      });
    });
  });
});
