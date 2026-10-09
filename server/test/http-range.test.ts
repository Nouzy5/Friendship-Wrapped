import { describe, expect, it } from "vitest";
import { parseRange } from "../src/lib/http-range.js";

describe("parseRange", () => {
  const size = 1000;

  it("serves the whole file when there is no usable range", () => {
    for (const header of [
      undefined,
      "",
      "items=0-10",
      "bytes=",
      "bytes=-",
      "bytes=abc-def",
      "bytes=0-10,20-30", // several ranges are answered with the whole file
      "bytes=10-5", // backwards: ignored
      "bytes 0-10",
      "0-10",
    ]) {
      expect(parseRange(header, size), String(header)).toBeNull();
    }
  });

  it("reads a closed range", () => {
    expect(parseRange("bytes=0-99", size)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=500-500", size)).toEqual({ start: 500, end: 500 });
    expect(parseRange("BYTES=10-20", size)).toEqual({ start: 10, end: 20 });
    expect(parseRange(" bytes=10-20 ", size)).toEqual({ start: 10, end: 20 });
  });

  it("cuts an end past the file back to its last byte", () => {
    expect(parseRange("bytes=900-5000", size)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=0-999", size)).toEqual({ start: 0, end: 999 });
  });

  it("reads an open-ended range", () => {
    expect(parseRange("bytes=100-", size)).toEqual({ start: 100, end: 999 });
    expect(parseRange("bytes=999-", size)).toEqual({ start: 999, end: 999 });
  });

  it("reads a suffix range: the last bytes", () => {
    expect(parseRange("bytes=-100", size)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", size)).toEqual({ start: 0, end: 999 }); // more than there is: all of it
  });

  it("says when a range starts past the end, or asks for nothing", () => {
    expect(parseRange("bytes=1000-", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=1000-1100", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
    expect(parseRange("bytes=-10", 0)).toBe("unsatisfiable");
  });

  it("copes with huge numbers without wrapping around", () => {
    expect(parseRange("bytes=99999999999999999999-", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-99999999999999999999", size)).toEqual({ start: 0, end: 999 });
  });
});
