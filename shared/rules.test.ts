import { describe, expect, it } from "vitest";
import { ageOn, evalScore, idPrefix, matchDateError, validSet, validSTB } from "./rules";

describe("set scores", () => {
  it("accepts valid 6-game sets", () => {
    for (const [a, b] of [[6, 0], [6, 4], [7, 5], [7, 6], [4, 6], [6, 7]]) expect(validSet(a, b, 6)).toBe("");
  });
  it("rejects invalid 6-game sets", () => {
    for (const [a, b] of [[6, 5], [7, 4], [8, 6], [5, 5], [6, 6], [3, 2]]) expect(validSet(a, b, 6)).not.toBe("");
  });
  it("handles 4-game sets with a tie-break at 4-4", () => {
    for (const [a, b] of [[4, 0], [4, 2], [5, 3], [5, 4]]) expect(validSet(a, b, 4)).toBe("");
    for (const [a, b] of [[4, 3], [5, 2], [6, 4]]) expect(validSet(a, b, 4)).not.toBe("");
  });
});

describe("super tie-breaker", () => {
  it("accepts first to 10, win by 2", () => {
    for (const [a, b] of [[10, 0], [10, 8], [12, 10], [9, 11]]) expect(validSTB(a, b)).toBe("");
  });
  it("rejects bad scores", () => {
    for (const [a, b] of [[10, 9], [9, 7], [12, 8], [11, 10]]) expect(validSTB(a, b)).not.toBe("");
  });
});

describe("whole matches", () => {
  it("best of 3 needs a third set only at 1-1", () => {
    expect(evalScore("bo3", [[6, 4], [6, 3], ["", ""]]).winner).toBe("A");
    expect(evalScore("bo3", [[6, 4], [3, 6], ["", ""]]).complete).toBe(false);
    expect(evalScore("bo3", [[6, 4], [3, 6], [7, 6]]).winner).toBe("A");
    expect(evalScore("bo3", [[4, 6], [3, 6], ["", ""]]).winner).toBe("B");
  });
  it("rejects a third set when the match was already won 2-0", () => {
    expect(evalScore("bo3", [[6, 4], [6, 3], [6, 1]]).error).not.toBe("");
  });
  it("single-set formats", () => {
    expect(evalScore("set6", [[7, 5]]).winner).toBe("A");
    expect(evalScore("set4", [[3, 5]]).winner).toBe("B");
    expect(evalScore("stb", [[8, 10]]).winner).toBe("B");
  });
});

describe("player id prefix", () => {
  it("uses initials", () => expect(idPrefix("Dolapo", "Amusan")).toBe("DA"));
  it("single names use first two letters", () => expect(idPrefix("Tobi", "")).toBe("TO"));
  it("hyphenated last names use the first letter", () => expect(idPrefix("Seun", "Adeyemi-Cole")).toBe("SA"));
});

describe("dates and ages", () => {
  it("computes age on a date", () => {
    expect(ageOn("2008-11-20", new Date("2026-11-19T12:00:00Z"))).toBe(17);
    expect(ageOn("2008-11-19", new Date("2026-11-19T12:00:00Z"))).toBe(18);
  });
  it("allows up to 14 days back, not the future", () => {
    expect(matchDateError("2026-11-19", "2026-11-19")).toBe("");
    expect(matchDateError("2026-11-05", "2026-11-19")).toBe("");
    expect(matchDateError("2026-11-04", "2026-11-19")).not.toBe("");
    expect(matchDateError("2026-11-20", "2026-11-19")).not.toBe("");
  });
});
