import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";
import { isVideoFile, MAX_VIDEO_BYTES, mediaFileError, MEDIA_ACCEPT } from "./media-files";

const file = (type: string) => new File([new Uint8Array(10)], "x", { type });

/** A File that reports `size` without allocating it. */
function sized(type: string, size: number): File {
  const f = file(type);
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("mediaFileError", () => {
  it("passes photos and videos the server takes", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/quicktime", "video/webm"]) {
      expect(mediaFileError(file(type)), type).toBeNull();
    }
  });

  it("keeps the photo rules for photos", () => {
    expect(mediaFileError(file("image/heic"))).toMatch(/HEIC/);
    expect(mediaFileError(file("application/pdf"))).toMatch(/supported image/);
    expect(mediaFileError(sized("image/jpeg", 21 * 1024 * 1024))).toBe("Photos can be at most 20 MB.");
  });

  it("turns away videos in other formats and over 100 MB", () => {
    expect(mediaFileError(file("video/x-msvideo"))).toMatch(/supported video/);
    expect(mediaFileError(sized("video/mp4", MAX_VIDEO_BYTES))).toBeNull();
    expect(mediaFileError(sized("video/mp4", MAX_VIDEO_BYTES + 1))).toBe("Videos can be at most 100 MB.");
  });

  it("offers photos and videos in the picker", () => {
    expect(MEDIA_ACCEPT.split(",")).toEqual(expect.arrayContaining(["image/jpeg", "video/mp4", "video/quicktime"]));
    expect(isVideoFile(file("video/mp4"))).toBe(true);
    expect(isVideoFile(file("image/jpeg"))).toBe(false);
  });
});

describe("formatDuration", () => {
  it("shows minutes and seconds, rounding up so a clip is never 0:00", () => {
    expect(formatDuration(0)).toBe("0:01");
    expect(formatDuration(400)).toBe("0:01");
    expect(formatDuration(1000)).toBe("0:01");
    expect(formatDuration(7000)).toBe("0:07");
    expect(formatDuration(7001)).toBe("0:08");
    expect(formatDuration(59_900)).toBe("1:00");
    expect(formatDuration(60_000)).toBe("1:00");
    expect(formatDuration(125_000)).toBe("2:05");
  });
});
