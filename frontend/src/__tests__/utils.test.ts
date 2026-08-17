import { describe, it, expect } from "vitest";
import { formatPercent, formatSize, NO_VALUE } from "../utils";

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

describe("formatPercent", () => {
  it.each([
    [0, "0.0%"],
    [0.9737, "97.4%"],
    [0.5, "50.0%"],
    [1, "100.0%"],
    [0.00004, "0.0%"],
  ] as [number, string][])(
    "returns %j for %j",
    (ratio, expected) => {
      expect(formatPercent(ratio)).toBe(expected);
    },
  );

  it("returns the placeholder for null", () => {
    expect(formatPercent(null)).toBe(NO_VALUE);
  });

  it("returns the placeholder for non-finite values", () => {
    expect(formatPercent(NaN)).toBe(NO_VALUE);
    expect(formatPercent(Infinity)).toBe(NO_VALUE);
  });
});
