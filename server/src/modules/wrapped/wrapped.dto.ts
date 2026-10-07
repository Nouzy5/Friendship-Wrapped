import type { PersonCount, YearStats } from "../analytics/analytics.service.js";
import type { PhotoView } from "../photos/photo.dto.js";

/** A collage needs a few photos to be a selection. */
const MIN_COLLAGE_PHOTOS = 2;
/** People shown after the top photographer. */
const RUNNERS_UP = 2;

/**
 * One slide of the story. The server decides which slides there are (a year without
 * reactions has no reactions slide); clients write the words around the numbers.
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
      busiestDay: { date: string; count: number } | null;
    }
  | { type: "mostReactedPhoto"; photo: PhotoView; count: number }
  | { type: "reactions"; total: number; comments: number; topReactor: PersonCount | null }
  | { type: "collage"; photos: PhotoView[] }
  | { type: "outro"; photos: number; reactions: number; comments: number; people: number };

type GroupRef = { id: string; name: string; emoji: string };

/** A Wrapped someone can open: one per group and year with photos. */
export type WrappedSummary = {
  group: GroupRef;
  year: number;
  /** False while the year is still going. */
  final: boolean;
};

export type WrappedView = WrappedSummary & {
  /** The zone the year was counted in. */
  timeZone: string;
  /** When the numbers were counted: now for a year in progress, or when a finished year was saved. */
  generatedAt: Date;
  slides: WrappedSlide[];
};

/** The story in order: intro, photos, top photographer, busiest month, most reacted photo, reactions, collage, outro. */
export function toSlides({ photos, reactions, comments, highlights, activeUserCount }: YearStats): WrappedSlide[] {
  const slides: WrappedSlide[] = [
    { type: "intro" },
    { type: "photos", total: photos.total, photographerCount: photos.byUser.length },
  ];
  if (photos.topPhotographer) {
    slides.push({
      type: "topPhotographer",
      top: photos.topPhotographer,
      runnersUp: photos.byUser.slice(1, 1 + RUNNERS_UP),
    });
  }
  if (photos.mostActiveMonth) {
    slides.push({
      type: "busiestMonth",
      ...photos.mostActiveMonth,
      byMonth: photos.byMonth,
      busiestDay: photos.mostActiveDay,
    });
  }
  if (reactions.mostReactedPhoto) slides.push({ type: "mostReactedPhoto", ...reactions.mostReactedPhoto });
  if (reactions.total > 0) {
    slides.push({
      type: "reactions",
      total: reactions.total,
      comments: comments.total,
      topReactor: reactions.byUser[0] ?? null,
    });
  }
  if (highlights.length >= MIN_COLLAGE_PHOTOS) slides.push({ type: "collage", photos: highlights });
  slides.push({
    type: "outro",
    photos: photos.total,
    reactions: reactions.total,
    comments: comments.total,
    people: activeUserCount,
  });
  return slides;
}
