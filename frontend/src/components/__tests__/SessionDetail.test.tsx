import { render, screen, waitFor } from "@testing-library/react";
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
    parts: [{ type: "text" as const, text: "Hello there" }],
  },
  {
    role: "assistant",
    parts: [{ type: "text" as const, text: "Hi! How can I help?" }],
  },
];

function renderDetail(overrides: {
  session?: ReturnType<typeof makeSession>;
  projectId?: string;
  onBack?: () => void;
  onDelete?: (id: string) => void;
} = {}) {
  const props = {
    session: makeSession(),
    projectId: "proj-1",
    onBack: vi.fn(),
    onDelete: vi.fn(),
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
});
