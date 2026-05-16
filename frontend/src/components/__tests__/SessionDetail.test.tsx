import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionDetail } from "../SessionDetail";
import { makeSession } from "../../test-utils/factories";

function mockFetchPending() {
  return vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
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
});
