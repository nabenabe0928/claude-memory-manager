import { render, screen, act, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { RefreshButton } from "../RefreshButton";

describe("RefreshButton", () => {
  it("renders with the refresh label initially", () => {
    render(<RefreshButton onRefresh={vi.fn()} />);
    expect(screen.getByRole("button", { name: "↻ Refresh" })).toBeInTheDocument();
  });

  it("is enabled in idle state", () => {
    render(<RefreshButton onRefresh={vi.fn()} />);
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("shows 'Refreshing...' and disables button while onRefresh is pending", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onRefresh = vi.fn(() => new Promise<void>((r) => { resolve = r; }));

    render(<RefreshButton onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Refreshing...")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();

    await act(async () => resolve());
  });

  it("calls onRefresh when clicked", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<RefreshButton onRefresh={onRefresh} />);

    await user.click(screen.getByRole("button"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("shows 'Refreshed!' after onRefresh resolves", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(<RefreshButton onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Refreshed!")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("returns to idle label after 1500ms timeout", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(<RefreshButton onRefresh={onRefresh} />);

    // Use fireEvent to avoid userEvent's internal timer delays with fake timers
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    // Flush the resolved microtask so handleClick completes the try block
    await act(async () => {});

    expect(screen.getByText("Refreshed!")).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(1500); });

    expect(screen.getByText("↻ Refresh")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeEnabled();

    vi.useRealTimers();
  });

  it("returns to idle immediately when onRefresh rejects", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("fail"));

    render(<RefreshButton onRefresh={onRefresh} />);

    // Use fireEvent + act to avoid userEvent hanging on rejected promises
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    // Flush the rejected microtask so the catch block runs
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByText("↻ Refresh")).toBeInTheDocument();
    });
    expect(screen.getByRole("button")).toBeEnabled();
  });
});
