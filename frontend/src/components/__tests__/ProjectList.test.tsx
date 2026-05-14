import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ProjectList } from "../ProjectList";
import { makeProject } from "../../test-utils/factories";

describe("ProjectList", () => {
  describe("when projects array is empty", () => {
    it("shows empty state message", () => {
      render(<ProjectList projects={[]} onSelect={vi.fn()} />);
      expect(screen.getByText("No projects found.")).toBeInTheDocument();
    });

    it("renders no list items", () => {
      render(<ProjectList projects={[]} onSelect={vi.fn()} />);
      expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    });
  });

  describe("when projects are provided", () => {
    it("renders each project name", () => {
      const projects = [
        makeProject({ id: "a", displayName: "Alpha" }),
        makeProject({ id: "b", displayName: "Beta" }),
      ];
      render(<ProjectList projects={projects} onSelect={vi.fn()} />);
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });

    it("shows memory count badge only when memoryCount > 0", () => {
      const projects = [
        makeProject({ id: "a", memoryCount: 0, sessionCount: 2 }),
        makeProject({ id: "b", memoryCount: 4, sessionCount: 1 }),
      ];
      render(<ProjectList projects={projects} onSelect={vi.fn()} />);
      expect(screen.queryByText("0 memories")).not.toBeInTheDocument();
      expect(screen.getByText("4 memories")).toBeInTheDocument();
    });

    it("always shows session count badge", () => {
      const projects = [makeProject({ sessionCount: 0 })];
      render(<ProjectList projects={projects} onSelect={vi.fn()} />);
      expect(screen.getByText("0 sessions")).toBeInTheDocument();
    });

    it("calls onSelect with the project id when clicked", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const projects = [makeProject({ id: "clicked-id", displayName: "Clickable" })];
      render(<ProjectList projects={projects} onSelect={onSelect} />);

      await user.click(screen.getByText("Clickable"));
      expect(onSelect).toHaveBeenCalledWith("clicked-id");
    });
  });

  describe("with a single project", () => {
    it("renders exactly one list item", () => {
      render(<ProjectList projects={[makeProject()]} onSelect={vi.fn()} />);
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
    });
  });
});
