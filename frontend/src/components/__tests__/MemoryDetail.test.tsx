import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryDetail } from "../MemoryDetail";
import { makeMemory } from "../../test-utils/factories";

describe("MemoryDetail", () => {
  describe("rendering", () => {
    it("displays the memory name, description, type, and filename", () => {
      render(
        <MemoryDetail memory={makeMemory()} onDelete={vi.fn()} onBack={vi.fn()} onRefresh={vi.fn()} />
      );
      expect(screen.getByRole("heading", { name: "test-memory" })).toBeInTheDocument();
      expect(screen.getByText("A test memory description")).toBeInTheDocument();
      expect(screen.getByText(/Type: user/)).toBeInTheDocument();
      expect(screen.getByText(/File: test-mem.md/)).toBeInTheDocument();
    });

    it("displays the memory content in a pre block", () => {
      render(
        <MemoryDetail memory={makeMemory()} onDelete={vi.fn()} onBack={vi.fn()} onRefresh={vi.fn()} />
      );
      expect(screen.getByText("Memory content body")).toBeInTheDocument();
    });
  });

  describe("delete flow", () => {
    it("does not show confirmation dialog initially", () => {
      render(
        <MemoryDetail memory={makeMemory()} onDelete={vi.fn()} onBack={vi.fn()} onRefresh={vi.fn()} />
      );
      expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
    });

    it("shows confirmation dialog when Delete button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <MemoryDetail memory={makeMemory()} onDelete={vi.fn()} onBack={vi.fn()} onRefresh={vi.fn()} />
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it("calls onDelete with filename when confirmed", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(
        <MemoryDetail
          memory={makeMemory({ filename: "to-delete.md" })}
          onDelete={onDelete}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
        />
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));
      const confirmButtons = screen.getAllByRole("button", { name: "Delete" });
      const confirmButton = confirmButtons[confirmButtons.length - 1];
      await user.click(confirmButton);
      expect(onDelete).toHaveBeenCalledWith("to-delete.md");
    });

    it("hides confirmation dialog when cancelled", async () => {
      const user = userEvent.setup();
      render(
        <MemoryDetail memory={makeMemory()} onDelete={vi.fn()} onBack={vi.fn()} onRefresh={vi.fn()} />
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
    });
  });

  describe("back button", () => {
    it("calls onBack when clicked", async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      render(
        <MemoryDetail memory={makeMemory()} onDelete={vi.fn()} onBack={onBack} onRefresh={vi.fn()} />
      );

      await user.click(screen.getByRole("button", { name: /back to memories/i }));
      expect(onBack).toHaveBeenCalledOnce();
    });
  });

  describe("with empty content", () => {
    it("renders without error", () => {
      render(
        <MemoryDetail
          memory={makeMemory({ content: "" })}
          onDelete={vi.fn()}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
        />
      );
      expect(screen.getByRole("heading", { name: "test-memory" })).toBeInTheDocument();
    });
  });
});
