import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";
import type { View } from "../../App";
import { makeProject, makeMemory, makeSession } from "../../test-utils/factories";

function fireKey(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...modifiers }));
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    view: "projects" as View,
    selectedProject: undefined,
    selectedMemory: null,
    selectedSession: null,
    projectDisplayName: "",
    onBack: {},
    onRefresh: {
      projects: vi.fn(),
      category: vi.fn(),
      memories: vi.fn(),
      detail: vi.fn(),
      sessions: vi.fn(),
      sessionDetail: vi.fn(),
    },
    onToast: vi.fn(),
    onOpenPalette: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(() => Promise.resolve()) },
  });
});

describe("useKeyboardShortcuts", () => {
  describe("back navigation", () => {
    it("Cmd+[ triggers back handler for category view", () => {
      const back = vi.fn();
      const config = makeConfig({ view: "category", onBack: { category: back } });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("[", { ctrlKey: true });
      expect(back).toHaveBeenCalledOnce();
    });

    it("Cmd+ArrowLeft triggers back handler for detail view", () => {
      const back = vi.fn();
      const config = makeConfig({ view: "detail", onBack: { detail: back } });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("ArrowLeft", { ctrlKey: true });
      expect(back).toHaveBeenCalledOnce();
    });

    it("Cmd+[ triggers back for sessionDetail view", () => {
      const back = vi.fn();
      const config = makeConfig({ view: "sessionDetail", onBack: { sessionDetail: back } });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("[", { ctrlKey: true });
      expect(back).toHaveBeenCalledOnce();
    });

    it("back is no-op on projects view", () => {
      const config = makeConfig({ view: "projects" });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("[", { ctrlKey: true });
      // no error, no handler called
    });
  });

  describe("forward navigation", () => {
    it("Cmd+] does not trigger any back handler", () => {
      const back = vi.fn();
      const config = makeConfig({ view: "category", onBack: { category: back } });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("]", { ctrlKey: true });
      expect(back).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    const views: View[] = ["projects", "category", "memories", "detail", "sessions", "sessionDetail"];

    views.forEach((view) => {
      it(`Cmd+R triggers refresh for ${view} view`, () => {
        const config = makeConfig({ view });
        renderHook(() => useKeyboardShortcuts(config));

        fireKey("r", { ctrlKey: true });
        expect(config.onRefresh[view]).toHaveBeenCalledOnce();
      });
    });
  });

  describe("copy path (Alt+P)", () => {
    it("copies project path in category view", () => {
      const project = makeProject({ path: "/projects/my-proj" });
      const config = makeConfig({ view: "category", selectedProject: project });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("p", { altKey: true, code: "KeyP" });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/projects/my-proj");
      expect(config.onToast).toHaveBeenCalledWith("Path copied!");
    });

    it("copies memory dir path in memories view", () => {
      const project = makeProject({ path: "/projects/my-proj" });
      const config = makeConfig({ view: "memories", selectedProject: project });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("p", { altKey: true, code: "KeyP" });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/projects/my-proj/memory");
    });

    it("copies memory file path in detail view", () => {
      const memory = makeMemory({ path: "/projects/my-proj/memory/test.md" });
      const config = makeConfig({ view: "detail", selectedMemory: memory });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("p", { altKey: true, code: "KeyP" });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/projects/my-proj/memory/test.md");
    });

    it("copies session path in sessionDetail view", () => {
      const session = makeSession({ path: "/projects/my-proj/session.jsonl" });
      const config = makeConfig({ view: "sessionDetail", selectedSession: session });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("p", { altKey: true, code: "KeyP" });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/projects/my-proj/session.jsonl");
    });

    it("is no-op in projects view", () => {
      const config = makeConfig({ view: "projects" });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("p", { altKey: true, code: "KeyP" });
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      expect(config.onToast).not.toHaveBeenCalled();
    });

    it("is no-op in sessions view", () => {
      const config = makeConfig({ view: "sessions" });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("p", { altKey: true, code: "KeyP" });
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
  });

  describe("copy resume cmd (Alt+R)", () => {
    it("copies resume command with cd prefix in sessionDetail view", () => {
      const session = makeSession({ id: "abc-123" });
      const config = makeConfig({ view: "sessionDetail", selectedSession: session, projectDisplayName: "~/my-project" });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("r", { altKey: true, code: "KeyR" });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("cd ~/my-project && claude --resume abc-123");
      expect(config.onToast).toHaveBeenCalledWith("Resume command copied!");
    });

    it("copies resume command without cd when projectDisplayName is empty", () => {
      const session = makeSession({ id: "abc-123" });
      const config = makeConfig({ view: "sessionDetail", selectedSession: session, projectDisplayName: "" });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("r", { altKey: true, code: "KeyR" });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("claude --resume abc-123");
    });

    it("is no-op outside sessionDetail view", () => {
      const config = makeConfig({ view: "memories" });
      renderHook(() => useKeyboardShortcuts(config));

      fireKey("r", { altKey: true, code: "KeyR" });
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
  });

  describe("input guard", () => {
    it("does not fire shortcuts when target is an input", () => {
      const back = vi.fn();
      const config = makeConfig({ view: "category", onBack: { category: back } });
      renderHook(() => useKeyboardShortcuts(config));

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "[", ctrlKey: true, bubbles: true }));
      document.body.removeChild(input);

      expect(back).not.toHaveBeenCalled();
    });

    it("does not fire shortcuts when target is a textarea", () => {
      const config = makeConfig({ view: "category" });
      renderHook(() => useKeyboardShortcuts(config));

      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true }));
      document.body.removeChild(textarea);

      expect(config.onRefresh.category).not.toHaveBeenCalled();
    });
  });
});
