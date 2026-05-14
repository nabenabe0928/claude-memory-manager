import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { CopyPathButton } from "../CopyPathButton";
import { altKey } from "../../utils";

describe("CopyPathButton", () => {
  it("renders with 'Copy path' label", () => {
    render(<CopyPathButton path="/some/path" />);
    expect(screen.getByRole("button", { name: "Copy path" })).toBeInTheDocument();
  });

  it("sets the title attribute to the path", () => {
    render(<CopyPathButton path="/some/long/path" />);
    expect(screen.getByRole("button")).toHaveAttribute("title", `/some/long/path (Copy by ${altKey}+P)`);
  });

  it("shows 'Copied!' feedback after click", async () => {
    const user = userEvent.setup();
    render(<CopyPathButton path="/test/path" />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  it("works with empty path", async () => {
    const user = userEvent.setup();
    render(<CopyPathButton path="" />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });
});
