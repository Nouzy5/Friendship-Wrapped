import { spawn } from "node:child_process";
import { env } from "../config/env.js";

/*
 * Everything that runs ffmpeg or ffprobe, and nothing else does. A video is converted once, on
 * upload, to a small H.264/AAC MP4 that every phone and browser plays; the upload itself is never
 * kept. Arguments always go to the programs as a list (never through a shell), file names are
 * ones the server made, and ffmpeg is only allowed to read local files: an uploaded file
 * can't make it fetch a URL.
 */

const FFMPEG = env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = env.FFPROBE_PATH ?? "ffprobe";

/** A conversion that takes longer than this is stopped. A minute of 1080p takes a few seconds. */
const CONVERT_TIMEOUT_MS = 3 * 60 * 1000;
const QUICK_TIMEOUT_MS = 30 * 1000;
/** Conversions run at most this many at a time, so a few uploads can't use up the server. */
const MAX_CONCURRENT_CONVERSIONS = 2;
/** The longest a video can be, in seconds. */
export const MAX_VIDEO_SECONDS = 60;

/** ffmpeg or ffprobe failed, or isn't there. `output` is the end of what it printed (for the log). */
export class MediaToolError extends Error {
  readonly tool: string;
  readonly output: string;

  constructor(tool: string, message: string, output = "") {
    super(`${tool}: ${message}`);
    this.name = "MediaToolError";
    this.tool = tool;
    this.output = output;
  }
}

type RunResult = { stdout: string; stderr: string };

function run(command: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new MediaToolError(command, `took longer than ${timeoutMs / 1000} seconds`, stderr.slice(-2000))));
    }, timeoutMs);

    // Capped, so a chatty program can't fill memory.
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 1_000_000) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-8000);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(() =>
        reject(new MediaToolError(command, error.code === "ENOENT" ? "isn't installed" : error.message, stderr)),
      );
    });
    child.on("close", (code) => {
      finish(() =>
        code === 0
          ? resolve({ stdout, stderr })
          : reject(new MediaToolError(command, `exited with code ${code}`, stderr.slice(-2000))),
      );
    });
  });
}

/** Whether videos can be handled here: both programs run. Checked again after a failure, so installing them needs no restart. */
let known = false;
export async function videoSupported(): Promise<boolean> {
  if (known) return true;
  try {
    await run(FFMPEG, ["-hide_banner", "-version"], QUICK_TIMEOUT_MS);
    await run(FFPROBE, ["-hide_banner", "-version"], QUICK_TIMEOUT_MS);
    known = true;
  } catch {
    return false;
  }
  return true;
}

export type VideoInfo = { durationMs: number; width: number; height: number; hasVideo: boolean };

/** What a file contains, as ffprobe sees it. Throws MediaToolError if it isn't a media file at all. */
export async function probeVideo(path: string): Promise<VideoInfo> {
  const { stdout } = await run(
    FFPROBE,
    ["-v", "error", "-protocol_whitelist", "file", "-print_format", "json", "-show_format", "-show_streams", path],
    QUICK_TIMEOUT_MS,
  );
  let parsed: { streams?: { codec_type?: string; width?: number; height?: number; duration?: string }[]; format?: { duration?: string } };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new MediaToolError(FFPROBE, "gave an answer that couldn't be read");
  }

  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const seconds = Number(parsed.format?.duration ?? video?.duration);
  return {
    durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    hasVideo: Boolean(video),
  };
}

/** A queue of waiting conversions, a few of which run at once. */
const waiting: (() => void)[] = [];
let running = 0;

async function gated<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_CONVERSIONS) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await job();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/**
 * Converts any video to an H.264/AAC MP4 at most 1280 px on its long side, turned upright, with
 * its metadata (including where it was filmed) dropped, and the index at the front so it plays
 * while it downloads. Needs the video to have been checked with `probeVideo` first.
 */
export function convertVideo(input: string, output: string): Promise<void> {
  return gated(async () => {
    await run(
      FFMPEG,
      [
        "-y",
        "-nostdin",
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-i",
        input,
        // A little over the limit, so a video of exactly a minute isn't cut short.
        "-t",
        String(MAX_VIDEO_SECONDS + 1),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-vf",
        "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-preset",
        "veryfast",
        "-crf",
        "25",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        output,
      ],
      CONVERT_TIMEOUT_MS,
    );
  });
}

/** One frame of the video, as a JPEG file, to be the picture shown before it plays. */
export async function extractPoster(video: string, output: string, atSeconds: number): Promise<void> {
  await run(
    FFMPEG,
    [
      "-y",
      "-nostdin",
      "-v",
      "error",
      "-protocol_whitelist",
      "file",
      "-ss",
      Math.max(0, atSeconds).toFixed(2),
      "-i",
      video,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      output,
    ],
    QUICK_TIMEOUT_MS,
  );
}
