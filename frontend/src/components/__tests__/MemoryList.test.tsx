import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryList } from "../MemoryList";
import { makeMemory } from "../../test-utils/factories";
import type { ComponentProps } from "react";

type ListProps = ComponentProps<typeof MemoryList>;

function renderList(overrides: Partial<ListProps> = {}) {
  const props: ListProps = {
    memories: [],
    projectName: "Test Project",
    memoryDirPath: "/path/to/memory",
    onSelect: vi.fn(),
    onBack: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MemoryList {...props} />) };
}

describe("MemoryList", () => {
  describe("when memories array is empty", () => {
    it("shows empty state message", () => {
      renderList();
      expect(screen.getByText("No memories in this project.")).toBeInTheDocument();
    });

    it("displays count as 0", () => {
      renderList();
      expect(screen.getByText("0 memories")).toBeInTheDocument();
    });
  });

  describe("when memories are provided", () => {
    const memories = [
      makeMemory({ filename: "a.md", name: "alpha", type: "user", description: "User mem" }),
      makeMemory({ filename: "b.md", name: "beta", type: "feedback", description: "Feedback mem" }),
      makeMemory({ filename: "c.md", name: "gamma", type: "project", description: "Project mem" }),
      makeMemory({ filename: "d.md", name: "delta", type: "reference", description: "Ref mem" }),
    ];

    it("renders each memory name and description", () => {
      renderList({ memories });
      for (const m of memories) {
        expect(screen.getByText(m.name)).toBeInTheDocument();
        expect(screen.getByText(m.description)).toBeInTheDocument();
      }
    });

    it("displays correct memory count", () => {
      renderList({ memories });
      expect(screen.getByText("4 memories")).toBeInTheDocument();
    });

    it("shows type badges for each memory type", () => {
      renderList({ memories });
      expect(screen.getByText("user")).toBeInTheDocument();
      expect(screen.getByText("feedback")).toBeInTheDocument();
      expect(screen.getByText("project")).toBeInTheDocument();
      expect(screen.getByText("reference")).toBeInTheDocument();
    });

    it("calls onSelect with the memory object when clicked", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      renderList({ memories, onSelect });

      await user.click(screen.getByText("alpha"));
      expect(onSelect).toHaveBeenCalledWith(memories[0]);
    });
  });

  describe("with unknown memory type", () => {
    it("renders the unknown type text", () => {
      const memories = [makeMemory({ type: "custom-type" })];
      renderList({ memories });
      expect(screen.getByText("custom-type")).toBeInTheDocument();
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
