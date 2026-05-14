import { describe, it, expect } from "vitest";
import { formatSize } from "../utils";

describe("formatSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1025, "1.0 KB"],
    [1024 * 512, "512.0 KB"],
    [1024 * 1024 - 1, "1024.0 KB"],
    [1024 * 1024, "1.0 MB"],
    [1024 * 1024 + 1, "1.0 MB"],
    [5.5 * 1024 * 1024, "5.5 MB"],
    [1024 * 1024 * 1024, "1024.0 MB"],
  ] as [number, string][])(
    "returns %j for %d bytes",
    (bytes, expected) => {
      expect(formatSize(bytes)).toBe(expected);
    },
  );
});
