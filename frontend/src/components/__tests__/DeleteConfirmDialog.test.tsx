import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DeleteConfirmDialog } from "../DeleteConfirmDialog";

function renderDialog(overrides: Partial<{
  itemName: string;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = {}) {
  const props = {
    itemName: "test-memory",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<DeleteConfirmDialog {...props} />) };
}

describe("DeleteConfirmDialog", () => {
  it("displays the item name in the confirmation message", () => {
    renderDialog();
    expect(screen.getByText("test-memory")).toBeInTheDocument();
  });

  it("uses default title when none provided", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Confirm Delete" })).toBeInTheDocument();
  });

  it("uses custom title when provided", () => {
    renderDialog({ title: "Delete Memory" });
    expect(screen.getByRole("heading", { name: "Delete Memory" })).toBeInTheDocument();
  });

  it("uses custom description when provided", () => {
    renderDialog({ description: "Custom warning text here." });
    expect(screen.getByText("Custom warning text here.")).toBeInTheDocument();
  });

  it("uses generic description when none provided", () => {
    renderDialog();
    expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
  });

  it("calls onConfirm when Delete button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderDialog({ onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when clicking outside the dialog", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderDialog({ onCancel });

    const heading = screen.getByRole("heading", { name: "Confirm Delete" });
    const dialogEl = heading.closest("[class*='dialog']")!;
    const overlay = dialogEl.parentElement!;
    await user.click(overlay);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not call onCancel when clicking inside the dialog", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderDialog({ onCancel });

    const heading = screen.getByRole("heading", { name: "Confirm Delete" });
    await user.click(heading);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("handles special characters in item name", () => {
    renderDialog({ itemName: "<script>alert('xss')</script>" });
    expect(
      screen.getByText("<script>alert('xss')</script>")
    ).toBeInTheDocument();
  });
});
