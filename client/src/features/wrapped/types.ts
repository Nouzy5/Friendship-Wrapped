import type { MemberColor } from "../../lib/member-colors";
import type { UserSummary } from "../auth/types";
import type { Photo } from "../photos/types";

/** `color` is their colour in the group now; null for people who have left. */
export type PersonCount = { user: UserSummary; count: number; color: MemberColor | null };

/**
 * One slide of the story. The server decides which slides there are (a year without
 * reactions has no reactions slide); the words around the numbers are written here.
 */
export type WrappedSlide =
  | { type: "intro" }
  | { type: "photos"; total: number; photographerCount: number; byUser: PersonCount[] }
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
      /** Who posted in that month, most first. */
      byUser: PersonCount[];
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
