import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  isWorkingDay,
  nthWorkingDayOfMonth,
  toIsoDate,
  workingDaysBetween,
} from "./working-days.ts";

// Reference calendar (May 2026):
//   Mon  4  Tue  5  Wed  6  Thu  7  Fri  8
//   Sat  9  Sun 10
//   Mon 11  Tue 12  Wed 13  Thu 14  Fri 15
//   Sat 16  Sun 17
//   Mon 18  Tue 19  Wed 20  Thu 21  Fri 22
//   Sat 23  Sun 24

describe("isWorkingDay", () => {
  it("treats Mon–Fri as working days", () => {
    expect(isWorkingDay("2026-05-04")).toBe(true); // Mon
    expect(isWorkingDay("2026-05-08")).toBe(true); // Fri
  });
  it("treats Sat/Sun as non-working", () => {
    expect(isWorkingDay("2026-05-09")).toBe(false); // Sat
    expect(isWorkingDay("2026-05-10")).toBe(false); // Sun
  });
});

describe("addWorkingDays", () => {
  it("adds n=0 returning the same day if it is a working day", () => {
    expect(toIsoDate(addWorkingDays("2026-05-04", 0))).toBe("2026-05-04");
  });
  it("normalizes a weekend start to the next working day for n=0", () => {
    expect(toIsoDate(addWorkingDays("2026-05-09", 0))).toBe("2026-05-11"); // Sat → Mon
    expect(toIsoDate(addWorkingDays("2026-05-10", 0))).toBe("2026-05-11"); // Sun → Mon
  });
  it("skips weekends mid-count", () => {
    expect(toIsoDate(addWorkingDays("2026-05-08", 1))).toBe("2026-05-11"); // Fri +1 → Mon
    expect(toIsoDate(addWorkingDays("2026-05-04", 5))).toBe("2026-05-11"); // Mon +5 working days
  });
  it("advances 14 working days from a Monday (standard Mahnstufe deadline)", () => {
    // Mon 4 May + 14 WT = Fri 22 May (skip Sat 9/Sun 10/Sat 16/Sun 17)
    expect(toIsoDate(addWorkingDays("2026-05-04", 14))).toBe("2026-05-22");
  });
  it("rejects negative n", () => {
    expect(() => addWorkingDays("2026-05-04", -1)).toThrow();
  });
});

describe("workingDaysBetween", () => {
  it("returns 0 for same day and reversed ranges", () => {
    expect(workingDaysBetween("2026-05-04", "2026-05-04")).toBe(0);
    expect(workingDaysBetween("2026-05-08", "2026-05-04")).toBe(0);
  });
  it("counts working days in a half-open range", () => {
    // [Mon 4, Fri 8) = Mon, Tue, Wed, Thu = 4
    expect(workingDaysBetween("2026-05-04", "2026-05-08")).toBe(4);
  });
  it("excludes weekends within the range", () => {
    // [Fri 8, Mon 11) = Fri only = 1
    expect(workingDaysBetween("2026-05-08", "2026-05-11")).toBe(1);
  });
  it("matches addWorkingDays round-trip for typical Mahnstufe deadlines", () => {
    const start = "2026-05-04";
    const deadline = addWorkingDays(start, 14);
    expect(workingDaysBetween(start, deadline)).toBe(14);
  });
});

describe("nthWorkingDayOfMonth", () => {
  it("returns the 3rd working day of May 2026 = Tue 5 May (§ 556b BGB fallback)", () => {
    // May 2026: Fri 1 (1st WT), Mon 4 (2nd), Tue 5 (3rd).
    expect(toIsoDate(nthWorkingDayOfMonth(2026, 5, 3))).toBe("2026-05-05");
  });
  it("handles a month starting on Sunday (Feb 2026 starts Sun 1)", () => {
    // Feb 2026: Sun 1, Mon 2, Tue 3 → 3rd working day = Wed 4 Feb
    expect(toIsoDate(nthWorkingDayOfMonth(2026, 2, 3))).toBe("2026-02-04");
  });
  it("throws when month has fewer than n working days", () => {
    expect(() => nthWorkingDayOfMonth(2026, 5, 100)).toThrow();
  });
});
