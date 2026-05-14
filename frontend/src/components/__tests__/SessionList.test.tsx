import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SessionList } from "../SessionList";
import { formatSize } from "../../utils";
import { makeSession } from "../../test-utils/factories";
import type { ComponentProps } from "react";

type ListProps = ComponentProps<typeof SessionList>;

function renderList(overrides: Partial<ListProps> = {}) {
  const props: ListProps = {
    sessions: [],
    projectName: "Test Project",
    onBack: vi.fn(),
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<SessionList {...props} />) };
}

describe("SessionList", () => {
  describe("when sessions array is empty", () => {
    it("shows empty state message", () => {
      renderList();
      expect(screen.getByText("No sessions in this project.")).toBeInTheDocument();
    });

    it("displays count as 0", () => {
      renderList();
      expect(screen.getByText("0 sessions")).toBeInTheDocument();
    });
  });

  describe("when sessions are provided", () => {
    const sessions = [
      makeSession({ id: "sess-1", summary: "First session", sizeBytes: 512 }),
      makeSession({ id: "sess-2", summary: "Second session", sizeBytes: 1048576 }),
    ];

    it("renders each session summary", () => {
      renderList({ sessions });
      expect(screen.getByText("First session")).toBeInTheDocument();
      expect(screen.getByText("Second session")).toBeInTheDocument();
    });

    it("displays correct session count", () => {
      renderList({ sessions });
      expect(screen.getByText("2 sessions")).toBeInTheDocument();
    });

    it("formats sizes correctly", () => {
      renderList({ sessions });
      const firstItem = screen.getByText("First session").closest("li")!;
      const secondItem = screen.getByText("Second session").closest("li")!;
      expect(within(firstItem).getByText("512 B")).toBeInTheDocument();
      expect(within(secondItem).getByText("1.0 MB")).toBeInTheDocument();
    });

    it("calls onSelect when a session row is clicked", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      renderList({ sessions, onSelect });

      await user.click(screen.getByText("First session"));
      expect(onSelect).toHaveBeenCalledWith(sessions[0]);
    });
  });

  describe("delete flow", () => {
    it("shows confirmation dialog when delete button is clicked", async () => {
      const user = userEvent.setup();
      const sessions = [makeSession({ id: "del-id-12" })];
      renderList({ sessions });

      const listItem = screen.getByText("A test session").closest("li")!;
      await user.click(within(listItem).getByRole("button", { name: "Delete" }));
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it("calls onDelete with session id when confirmed", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      const sessions = [makeSession({ id: "del-sess" })];
      renderList({ sessions, onDelete });

      const listItem = screen.getByText("A test session").closest("li")!;
      await user.click(within(listItem).getByRole("button", { name: "Delete" }));

      const dialog = screen.getByText(/are you sure/i).closest(".dialog")!;
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect(onDelete).toHaveBeenCalledWith("del-sess");
    });

    it("does not trigger onSelect when delete button is clicked", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const sessions = [makeSession()];
      renderList({ sessions, onSelect });

      const listItem = screen.getByText("A test session").closest("li")!;
      await user.click(within(listItem).getByRole("button", { name: "Delete" }));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("back button", () => {
    it("calls onBack when clicked", async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      renderList({ onBack });

      await user.click(screen.getByRole("button", { name: /back/i }));
      expect(onBack).toHaveBeenCalledOnce();
    });
  });
});

describe("formatSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [1048576, "1.0 MB"],
    [1572864, "1.5 MB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});
