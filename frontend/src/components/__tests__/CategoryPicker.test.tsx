import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CategoryPicker } from "../CategoryPicker";
import type { ComponentProps } from "react";

type PickerProps = ComponentProps<typeof CategoryPicker>;

function renderPicker(overrides: Partial<PickerProps> = {}) {
  const props: PickerProps = {
    projectName: "My Project",
    projectPath: "/home/user/.claude/projects/my-project",
    memoryCount: 5,
    sessionCount: 10,
    onSelectMemories: vi.fn(),
    onSelectSessions: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<CategoryPicker {...props} />) };
}

function getMemoriesCard() {
  return screen.getByRole("button", { name: /memories.*structured/i });
}

function getSessionsCard() {
  return screen.getByRole("button", { name: /sessions.*conversation/i });
}

describe("CategoryPicker", () => {
  describe("rendering", () => {
    it("displays the project name", () => {
      renderPicker();
      expect(screen.getByRole("heading", { name: "My Project" })).toBeInTheDocument();
    });

    it("displays memory and session counts inside their cards", () => {
      renderPicker();
      expect(within(getMemoriesCard()).getByText("5")).toBeInTheDocument();
      expect(within(getSessionsCard()).getByText("10")).toBeInTheDocument();
    });
  });

  describe("memories button", () => {
    it("is disabled when memoryCount is 0", () => {
      renderPicker({ memoryCount: 0 });
      expect(getMemoriesCard()).toBeDisabled();
    });

    it("is enabled when memoryCount > 0", () => {
      renderPicker({ memoryCount: 1 });
      expect(getMemoriesCard()).toBeEnabled();
    });

    it("calls onSelectMemories when clicked", async () => {
      const user = userEvent.setup();
      const onSelectMemories = vi.fn();
      renderPicker({ onSelectMemories });

      await user.click(getMemoriesCard());
      expect(onSelectMemories).toHaveBeenCalledOnce();
    });
  });

  describe("sessions button", () => {
    it("is never disabled even with 0 sessions", () => {
      renderPicker({ sessionCount: 0 });
      expect(getSessionsCard()).toBeEnabled();
    });

    it("calls onSelectSessions when clicked", async () => {
      const user = userEvent.setup();
      const onSelectSessions = vi.fn();
      renderPicker({ onSelectSessions });

      await user.click(getSessionsCard());
      expect(onSelectSessions).toHaveBeenCalledOnce();
    });
  });

  describe("back button", () => {
    it("calls onBack when clicked", async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      renderPicker({ onBack });

      await user.click(screen.getByRole("button", { name: /back to projects/i }));
      expect(onBack).toHaveBeenCalledOnce();
    });
  });
});
