import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ProjectTree } from "../ProjectTree";
import type { ComponentProps } from "react";
import { makeTreeChild, makeTreeResponse } from "../../test-utils/factories";

type TreeProps = ComponentProps<typeof ProjectTree>;

function renderTree(overrides: Partial<TreeProps> = {}) {
  const props: TreeProps = {
    expandedPaths: new Set(),
    childrenCache: new Map(),
    selfProjectCache: new Map(),
    rootResponse: makeTreeResponse({
      children: [
        makeTreeChild({ name: "project-a", path: "/home/user/project-a" }),
        makeTreeChild({ name: "project-b", path: "/home/user/project-b", memoryCount: 0, sessionCount: 2 }),
      ],
    }),
    onToggle: vi.fn(),
    onCollapse: vi.fn(),
    onSelect: vi.fn(),
    onRefresh: vi.fn(),
    onRootLoaded: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ProjectTree {...props} />) };
}

describe("ProjectTree", () => {
  describe("loading state", () => {
    it("shows loading state when rootResponse is null", () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => makeTreeResponse(),
      } as Response);

      renderTree({ rootResponse: null });
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("fetches /api/tree on mount when rootResponse is null", () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => makeTreeResponse(),
      } as Response);

      renderTree({ rootResponse: null });
      expect(fetchSpy).toHaveBeenCalledWith("/api/tree");
    });

    it("does not fetch when rootResponse is already provided", () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => makeTreeResponse(),
      } as Response);

      renderTree();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("rendering root children", () => {
    it("renders root children when rootResponse provided", () => {
      renderTree();
      expect(screen.getByText("project-a")).toBeInTheDocument();
      expect(screen.getByText("project-b")).toBeInTheDocument();
    });

    it("shows count badges for project nodes", () => {
      renderTree({
        rootResponse: makeTreeResponse({
          children: [
            makeTreeChild({ name: "my-proj", path: "/p", memoryCount: 4, sessionCount: 7 }),
          ],
        }),
      });

      const row = screen.getByText("my-proj").closest("li")!;
      expect(within(row).getByText("4 memories")).toBeInTheDocument();
      expect(within(row).getByText("7 sessions")).toBeInTheDocument();
    });

    it("does not show memory badge when memoryCount is 0", () => {
      renderTree({
        rootResponse: makeTreeResponse({
          children: [
            makeTreeChild({ name: "no-mem", path: "/p", memoryCount: 0, sessionCount: 3 }),
          ],
        }),
      });

      const row = screen.getByText("no-mem").closest("li")!;
      expect(within(row).queryByText(/memories/)).not.toBeInTheDocument();
      expect(within(row).getByText("3 sessions")).toBeInTheDocument();
    });
  });

  describe("expand toggle", () => {
    it("shows expand toggle only for nodes with hasChildren", () => {
      renderTree({
        rootResponse: makeTreeResponse({
          children: [
            makeTreeChild({ name: "parent", path: "/p", hasChildren: true }),
            makeTreeChild({ name: "leaf", path: "/l", hasChildren: false }),
          ],
        }),
      });

      const parentRow = screen.getByText("parent").closest("li")!;
      expect(within(parentRow).getByRole("button", { name: "Expand" })).toBeInTheDocument();

      const leafRow = screen.getByText("leaf").closest("li")!;
      expect(within(leafRow).queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
      expect(within(leafRow).queryByRole("button", { name: "Collapse" })).not.toBeInTheDocument();
    });

    it("does not show expand toggle for leaf project nodes", () => {
      renderTree({
        rootResponse: makeTreeResponse({
          children: [
            makeTreeChild({ name: "leaf-proj", path: "/lp", isProject: true, hasChildren: false }),
          ],
        }),
      });

      const row = screen.getByText("leaf-proj").closest("li")!;
      expect(within(row).queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("clicking a project node calls onSelect", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      renderTree({
        rootResponse: makeTreeResponse({
          displayPath: "~",
          children: [
            makeTreeChild({
              name: "my-project",
              path: "/home/user/my-project",
              isProject: true,
              projectId: "proj-1",
              projectPath: "/home/user/.claude/projects/-home-user-my-project",
              memoryCount: 3,
              sessionCount: 5,
            }),
          ],
        }),
        onSelect,
      });

      await user.click(screen.getByText("my-project"));
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledWith({
        id: "proj-1",
        displayName: "~/my-project",
        path: "/home/user/.claude/projects/-home-user-my-project",
        memoryCount: 3,
        sessionCount: 5,
      });
    });

    it("clicking expand toggle fetches children and calls onToggle", async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      const childData = makeTreeResponse({
        selfProject: null,
        children: [
          makeTreeChild({ name: "sub-child", path: "/p/sub-child" }),
        ],
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => childData,
      } as Response);

      renderTree({
        rootResponse: makeTreeResponse({
          children: [
            makeTreeChild({ name: "parent-dir", path: "/p", isProject: false, projectId: null, projectPath: null, hasChildren: true }),
          ],
        }),
        onToggle,
      });

      await user.click(screen.getByRole("button", { name: "Expand" }));

      await waitFor(() => {
        expect(onToggle).toHaveBeenCalledOnce();
      });
      expect(onToggle).toHaveBeenCalledWith("/p", childData.children, null);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/tree?path=%2Fp");
    });

    it("clicking collapse calls onCollapse", async () => {
      const user = userEvent.setup();
      const onCollapse = vi.fn();
      const childNode = makeTreeChild({ name: "child", path: "/p/child" });

      renderTree({
        expandedPaths: new Set(["/p"]),
        childrenCache: new Map([["/p", [childNode]]]),
        rootResponse: makeTreeResponse({
          children: [
            makeTreeChild({ name: "parent-dir", path: "/p", isProject: false, projectId: null, projectPath: null, hasChildren: true }),
          ],
        }),
        onCollapse,
      });

      await user.click(screen.getByRole("button", { name: "Collapse" }));
      expect(onCollapse).toHaveBeenCalledOnce();
      expect(onCollapse).toHaveBeenCalledWith("/p");
    });

    it("pure directories are not clickable as projects", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => makeTreeResponse(),
      } as Response);

      renderTree({
        rootResponse: makeTreeResponse({
          children: [
            makeTreeChild({
              name: "pure-dir",
              path: "/d",
              isProject: false,
              projectId: null,
              projectPath: null,
              hasChildren: true,
            }),
          ],
        }),
        onSelect,
      });

      await user.click(screen.getByText("pure-dir"));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("expanded children from cache", () => {
    it("renders expanded children from cache", () => {
      const childNode = makeTreeChild({ name: "sub-project", path: "/p/sub-project", memoryCount: 1, sessionCount: 2 });

      renderTree({
        expandedPaths: new Set(["/p"]),
        childrenCache: new Map([["/p", [childNode]]]),
        rootResponse: makeTreeResponse({
          children: [
            makeTreeChild({ name: "parent-dir", path: "/p", isProject: false, projectId: null, projectPath: null, hasChildren: true }),
          ],
        }),
      });

      expect(screen.getByText("sub-project")).toBeInTheDocument();
    });
  });

  describe("selfProject", () => {
    it("shows 'this directory' entry when selfProject is present at root", () => {
      renderTree({
        rootResponse: makeTreeResponse({
          displayPath: "~",
          selfProject: {
            id: "root-proj",
            projectPath: "/home/user/.claude/projects/-home-user",
            memoryCount: 2,
            sessionCount: 8,
          },
          children: [],
        }),
      });

      expect(screen.getByText("~ (this directory)")).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no projects", () => {
      renderTree({
        rootResponse: makeTreeResponse({
          selfProject: null,
          children: [],
        }),
      });

      expect(screen.getByText("No projects found.")).toBeInTheDocument();
    });
  });
});
