import { useEffect, useRef } from "react";
import type { View } from "../App";
import type { Project, Memory, Session } from "../types";
import { isMac } from "../utils";

interface KeyboardShortcutConfig {
  view: View;
  selectedProject: Project | undefined;
  selectedMemory: Memory | null;
  selectedSession: Session | null;
  onBack: Partial<Record<View, () => void>>;
  onRefresh: Record<View, () => Promise<void> | void>;
  onToast: (message: string) => void;
}

function isEditableTarget(e: KeyboardEvent): boolean {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function getCopyPath(
  view: View,
  project: Project | undefined,
  memory: Memory | null,
  session: Session | null,
): string | null {
  switch (view) {
    case "category":
      return project?.path ?? null;
    case "memories":
      return project ? project.path + "/memory" : null;
    case "detail":
      return memory?.path ?? null;
    case "sessionDetail":
      return session?.path ?? null;
    default:
      return null;
  }
}

export function useKeyboardShortcuts(config: KeyboardShortcutConfig): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;

      const c = configRef.current;
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && (e.key === "[" || e.key === "ArrowLeft")) {
        e.preventDefault();
        c.onBack[c.view]?.();
        return;
      }

      if (mod && (e.key === "]" || e.key === "ArrowRight")) {
        e.preventDefault();
        return;
      }

      if (mod && e.key === "r") {
        e.preventDefault();
        Promise.resolve(c.onRefresh[c.view]()).then(() => {
          c.onToast("Refreshed!");
        });
        return;
      }

      if (e.altKey && e.key === "p") {
        e.preventDefault();
        const path = getCopyPath(
          c.view,
          c.selectedProject,
          c.selectedMemory,
          c.selectedSession,
        );
        if (path) {
          navigator.clipboard.writeText(path);
          c.onToast("Path copied!");
        }
        return;
      }

      if (e.altKey && e.key === "r") {
        e.preventDefault();
        if (c.view === "sessionDetail" && c.selectedSession) {
          navigator.clipboard.writeText(
            `claude --resume ${c.selectedSession.id}`,
          );
          c.onToast("Resume command copied!");
        }
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}
