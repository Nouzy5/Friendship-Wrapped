import { describe, expect, it } from "vitest";
import { canonicalTimeZone, dayRangeIn, dayStartsOfYear, isValidTimeZone } from "../src/lib/time-zone.js";

const range = (date: string, timeZone: string) => {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const { from, to } = dayRangeIn({ year, month, day }, timeZone);
  return [from.toISOString(), to.toISOString()];
};

describe("calendar days in a time zone", () => {
  it("run from local midnight to local midnight, 23 or 25 hours long on DST days", () => {
    expect(range("2026-10-06", "Europe/Bratislava")).toEqual(["2026-10-05T22:00:00.000Z", "2026-10-06T22:00:00.000Z"]);
    expect(range("2026-03-29", "Europe/Bratislava")).toEqual(["2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"]);
    expect(range("2026-10-25", "Europe/Bratislava")).toEqual(["2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z"]);
    expect(range("2026-10-06", "Asia/Kathmandu")).toEqual(["2026-10-05T18:15:00.000Z", "2026-10-06T18:15:00.000Z"]);
  });

  it("start when the clocks jump, where spring-forward skips midnight", () => {
    // Clocks go from 23:59:59 straight to 01:00: the day begins at 01:00, not an hour earlier.
    expect(range("2026-09-06", "America/Santiago")).toEqual(["2026-09-06T04:00:00.000Z", "2026-09-07T03:00:00.000Z"]);
    expect(range("2026-03-08", "America/Havana")).toEqual(["2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"]);
    expect(range("2026-03-29", "Atlantic/Azores")).toEqual(["2026-03-29T01:00:00.000Z", "2026-03-30T00:00:00.000Z"]);
  });

  it("start at the first midnight where fall-back repeats it", () => {
    expect(range("2020-10-30", "Asia/Amman")).toEqual(["2020-10-29T21:00:00.000Z", "2020-10-30T22:00:00.000Z"]);
  });

  it("is empty for a day a zone skipped altogether", () => {
    // Samoa jumped over 30 December 2011.
    const [from, to] = range("2011-12-30", "Pacific/Apia");
    expect(from).toBe(to);
  });

  it("covers every day of the year, in order, in any zone", () => {
    for (const timeZone of ["UTC", "Europe/Bratislava", "America/Santiago", "Pacific/Kiritimati", "Etc/GMT+12"]) {
      const starts = dayStartsOfYear(2028, timeZone).map((start) => start.getTime());
      expect(starts).toHaveLength(367); // 366 days of a leap year, then the next year's start
      expect(starts.every((start, index) => index === 0 || start > starts[index - 1]!)).toBe(true);
    }
  });
});

describe("time zone names", () => {
  it("accepts any spelling of a real zone and gives its canonical name", () => {
    expect(isValidTimeZone("europe/bratislava")).toBe(true);
    expect(canonicalTimeZone("europe/bratislava")).toBe("Europe/Bratislava");
    expect(canonicalTimeZone("Etc/UTC")).toBe("UTC");
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
