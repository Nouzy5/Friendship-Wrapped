import type { UserSummary } from "../auth/types";
import type { Photo } from "../photos/types";

export type PersonCount = { user: UserSummary; count: number };

/**
 * One slide of the story. The server decides which slides there are (a year without
 * reactions has no reactions slide); the words around the numbers are written here.
 */
export type WrappedSlide =
  | { type: "intro" }
  | { type: "photos"; total: number; photographerCount: number }
  | { type: "topPhotographer"; top: PersonCount; runnersUp: PersonCount[] }
  | {
      type: "busiestMonth";
      /** 1–12. */
      month: number;
      count: number;
      /** 12 counts, January first. */
      byMonth: number[];
      /** "YYYY-MM-DD". */
      busiestDay: { date: string; count: number } | null;
    }
  | { type: "mostReactedPhoto"; photo: Photo; count: number }
  | { type: "reactions"; total: number; comments: number; topReactor: PersonCount | null }
  | { type: "collage"; photos: Photo[] }
  | { type: "outro"; photos: number; reactions: number; comments: number; people: number };

export type WrappedSlideType = WrappedSlide["type"];

/** A Wrapped you can open: one per group and year with photos. */
export type WrappedSummary = {
  group: { id: string; name: string; emoji: string };
  year: number;
  /** False while the year is still going (the numbers keep growing). */
  final: boolean;
};

export type Wrapped = WrappedSummary & {
  timeZone: string;
  generatedAt: string;
  slides: WrappedSlide[];
};
