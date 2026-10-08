import type { Readable, Writable } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import * as storage from "../../lib/storage.js";
import { localTimeIn } from "../../lib/time-zone.js";
import * as settingsRepository from "../settings/settings.repository.js";
import * as photosRepository from "./photos.repository.js";

// Characters Windows, macOS or zip tools don't accept in a file name.
const UNSAFE = /[<>:"/\\|?*\p{Cc}]/gu;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A name that's safe as one folder or file name on any system. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(UNSAFE, "_").replace(/[. ]+$/, "").trim().slice(0, 80);
  if (!cleaned) return fallback;
  return RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** Hands out each name once (ignoring case): a repeat becomes "name (2)", "name (3)", … */
class UniqueNames {
  private readonly used = new Set<string>();

  take(base: string, extension = ""): string {
    for (let n = 1; ; n++) {
      const name = `${n === 1 ? base : `${base} (${n})`}${extension}`;
      if (!this.used.has(name.toLowerCase())) {
        this.used.add(name.toLowerCase());
        return name;
      }
    }
  }
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "2025-08-01 21.04.05", in the person's own zone. */
function photoFileName(createdAt: Date, timeZone: string): string {
  const { date, minutes } = localTimeIn(createdAt, timeZone);
  const seconds = createdAt.getUTCSeconds();
  return `${date.year}-${pad(date.month)}-${pad(date.day)} ${pad(Math.floor(minutes / 60))}.${pad(minutes % 60)}.${pad(seconds)}`;
}

/**
 * Streams a zip of the full rendition of every photo the person posted, in any group,
 * as `<group name>/<YYYY-MM-DD HH.mm.ss>.webp` (times in their own zone, or UTC). Photos
 * are fetched from storage one at a time as the zip is written, so memory stays flat
 * however many there are. The images are already compressed, so they're stored as they are.
 */
export async function writePhotoArchive(userId: string, out: Writable): Promise<void> {
  const [photos, settings] = await Promise.all([
    photosRepository.listArchivePhotos(userId),
    settingsRepository.findSettings(userId),
  ]);
  const timeZone = settings?.timeZone ?? "UTC";

  const zip = new ZipFile();
  const output = zip.outputStream as Readable;
  const written = pipeline(output, out);
  written.catch(() => {}); // awaited below; this only keeps an early failure from being "unhandled"
  zip.on("error", (error: Error) => output.destroy(error));

  const folders = new UniqueNames();
  const folderOf = new Map<string, { name: string; files: UniqueNames }>();
  let current: storage.StoredObject | null = null;

  try {
    for (const photo of photos) {
      let folder = folderOf.get(photo.groupId);
      if (!folder) {
        folder = { name: folders.take(safeFileName(photo.group.name, "Group")), files: new UniqueNames() };
        folderOf.set(photo.groupId, folder);
      }

      current = await storage.getObject(photo.storageKey);
      if (!current) continue; // a missing file shouldn't spoil the rest

      const name = `${folder.name}/${folder.files.take(photoFileName(photo.createdAt, timeZone), ".webp")}`;
      zip.addReadStream(current.body, name, { mtime: photo.createdAt, compress: false });
      // One photo at a time; stop waiting if the download fails or is abandoned.
      await Promise.race([finished(current.body), written]);
      current = null;
    }
    zip.end();
  } catch (error) {
    current?.body.destroy();
    output.destroy(error as Error);
  }
  await written;
}
