import { describe, it, expect } from "vitest";
import { fuzzyMatch } from "../fuzzyMatch";

describe("fuzzyMatch", () => {
  describe("early returns", () => {
    it("returns score 0 and empty indices for an empty query", () => {
      expect(fuzzyMatch("", "anything")).toEqual({ score: 0, indices: [] });
    });

    it("returns null when no characters match", () => {
      expect(fuzzyMatch("xyz", "abc")).toBeNull();
    });

    it("returns null when query is longer than 2x target length", () => {
      expect(fuzzyMatch("abcde", "ab")).toBeNull();
    });

    it("allows query up to exactly 2x target length", () => {
      // query "ab" (len 2) vs target "a" (len 1): 2 > 1*2 is false, so not rejected by length check
      // but only 1 of 2 chars matches (ratio 0.5 < 0.75), so rejected by ratio
      expect(fuzzyMatch("ab", "a")).toBeNull();
    });
  });

  describe("ratio threshold", () => {
    it("returns null when match ratio is below 75%", () => {
      // query "abcd" in target "aXXX": matches 1 of 4 = 25%
      expect(fuzzyMatch("abcd", "aXXXXXXX")).toBeNull();
    });

    it("returns non-null when match ratio is exactly 75%", () => {
      // query "abcd" in target "abcX": matches a(0), b(1), c(2) => 3 of 4 = 75%
      const result = fuzzyMatch("abcd", "abcX");
      expect(result).not.toBeNull();
      expect(result!.indices).toEqual([0, 1, 2]);
    });

    it("returns non-null when match ratio is above 75%", () => {
      // query "abc" in target "abc": matches 3 of 3 = 100%
      const result = fuzzyMatch("abc", "abc");
      expect(result).not.toBeNull();
    });
  });

  describe("case insensitivity", () => {
    it("matches regardless of case", () => {
      const result = fuzzyMatch("ABC", "abc");
      expect(result).not.toBeNull();
      expect(result!.indices).toEqual([0, 1, 2]);
    });

    it("matches mixed case query against mixed case target", () => {
      const result = fuzzyMatch("FoO", "fOo");
      expect(result).not.toBeNull();
      expect(result!.indices).toEqual([0, 1, 2]);
    });
  });

  describe("full exact match", () => {
    it("matches all characters consecutively", () => {
      const result = fuzzyMatch("abc", "abc");
      expect(result).not.toBeNull();
      expect(result!.indices).toEqual([0, 1, 2]);
    });
  });

  describe("single character", () => {
    it("matches a single character query against a single character target", () => {
      const result = fuzzyMatch("a", "a");
      expect(result).not.toBeNull();
      expect(result!.indices).toEqual([0]);
    });

    it("returns null for a single character that does not match", () => {
      expect(fuzzyMatch("a", "b")).toBeNull();
    });
  });

  describe("scoring: gaps between matched characters increase score", () => {
    it("scores a gapped match worse than a consecutive match", () => {
      // "ac" in "abc" -> indices [0,2], gap = 1
      // "ac" in "ac"  -> indices [0,1], gap = 0
      const gapped = fuzzyMatch("ac", "abc");
      const consecutive = fuzzyMatch("ac", "ac");
      expect(gapped).not.toBeNull();
      expect(consecutive).not.toBeNull();
      expect(gapped!.score).toBeGreaterThan(consecutive!.score);
    });
  });

  describe("scoring: later start position increases score", () => {
    it("scores a match starting later worse than one starting at position 0", () => {
      // "ab" in "ab"   -> starts at 0
      // "ab" in "xxab" -> starts at 2
      const early = fuzzyMatch("ab", "ab");
      const late = fuzzyMatch("ab", "xxab");
      expect(early).not.toBeNull();
      expect(late).not.toBeNull();
      expect(late!.score).toBeGreaterThan(early!.score);
    });
  });

  describe("scoring: word-boundary bonus decreases score", () => {
    it.each(["-", "_", "/", " ", "~"])(
      "gives a bonus when match follows '%s'",
      (sep) => {
        // "b" in "xb"   -> no boundary bonus
        // "b" in `x${sep}b` -> boundary bonus (score -= 5)
        const withoutBoundary = fuzzyMatch("b", "xb");
        const withBoundary = fuzzyMatch("b", `x${sep}b`);
        expect(withoutBoundary).not.toBeNull();
        expect(withBoundary).not.toBeNull();
        expect(withBoundary!.score).toBeLessThan(withoutBoundary!.score);
      },
    );

    it("gives a bonus for a match at position 0", () => {
      // "a" in "a"  -> idx=0, gets boundary bonus
      // "a" in "xa" -> idx=1, no boundary bonus, plus start penalty
      const atStart = fuzzyMatch("a", "a");
      const notAtStart = fuzzyMatch("a", "xa");
      expect(atStart).not.toBeNull();
      expect(notAtStart).not.toBeNull();
      expect(atStart!.score).toBeLessThan(notAtStart!.score);
    });
  });

  describe("scoring: target length adds a small penalty", () => {
    it("scores a longer target slightly worse than a shorter one for the same match", () => {
      const short = fuzzyMatch("ab", "ab");
      const long = fuzzyMatch("ab", "abxxxxxxxx");
      expect(short).not.toBeNull();
      expect(long).not.toBeNull();
      expect(long!.score).toBeGreaterThan(short!.score);
    });
  });

  describe("deterministic score calculation", () => {
    it("computes the expected score for a known input", () => {
      // query "ac", target "abc"
      // q="ac", t="abc", indices=[0,2], matched=2, ratio=2/2=1.0
      // score = (1-1.0)*100 = 0
      // gap: indices[1]-indices[0]-1 = 2-0-1 = 1 -> score += 1 => 1
      // start: indices[0]=0, no start penalty
      // boundary: idx=0 -> score -= 5 => -4; idx=2 -> t[1]='b', not boundary -> no bonus
      // length: 3 * 0.1 = 0.3 -> score += 0.3 => -3.7
      const result = fuzzyMatch("ac", "abc");
      expect(result).not.toBeNull();
      expect(result!.score).toBeCloseTo(-3.7);
      expect(result!.indices).toEqual([0, 2]);
    });
  });
});
