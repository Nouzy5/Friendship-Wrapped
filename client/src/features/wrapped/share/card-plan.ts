import { formatDayMonth, formatNumber, nounFor } from "../../../lib/format";
import { MEMBER_PALETTE, type MemberColor } from "../../../lib/member-colors";
import type { PersonCount, Wrapped, WrappedSlide } from "../types";

/*
 * What a Wrapped share card shows, decided as plain data. A card is drawn on the device (see
 * card-render.ts) and leaves only through the system share sheet; nothing about it is sent to
 * the server. Keeping the decisions here, away from the canvas, is what makes them testable.
 *
 * The rule that matters most: a photo the viewer isn't allowed to save never goes on a card.
 * Exporting a card counts as saving, so photos from people who turned off photo saving are
 * replaced with a block of their colour, and their image is not even fetched.
 */

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

/** A fill and the ink that reads on it. */
export type Fill = { background: string; ink: string };

/** Before anyone has picked a colour, and for people who have left the group. */
const NEUTRAL: Fill = { background: "#d0d0cc", ink: "#000000" };

export function fillOf(color: MemberColor | null | undefined): Fill {
  if (!color) return NEUTRAL;
  const swatch = MEMBER_PALETTE[color];
  return { background: swatch.hex, ink: swatch.ink };
}

/** A card's colours. Fixed, not the app's theme: a shared card looks the same wherever it lands. */
export type Tone = Fill & { sub: string; panel: string };

const PAPER: Tone = { background: "#ffffff", ink: "#000000", sub: "#6e6e6a", panel: "#f2f2f0" };
const NIGHT: Tone = { background: "#000000", ink: "#ffffff", sub: "#a8a8a4", panel: "#1c1c1b" };

function personTone(color: MemberColor | null | undefined): Tone {
  const fill = fillOf(color);
  const dark = fill.ink === "#000000";
  return { ...fill, sub: dark ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.78)", panel: dark ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.18)" };
}

/** A photo, or a block of its uploader's colour where it may not be saved. */
export type PhotoSlot =
  | { kind: "photo"; url: string; /** Shown if the image can't be loaded. */ fallback: Fill }
  | { kind: "block"; fill: Fill };

type SlotPhoto = {
  canSave: boolean;
  imageUrls: { thumbnail: string; medium: string };
  uploader: { id: string };
};

/**
 * `canSave` is the server's answer to "may this viewer download this photo?": always for their
 * own, and for others' only if the uploader allows it. Anything else becomes a colour block.
 */
export function photoSlot(photo: SlotPhoto, colorOf: (userId: string) => MemberColor | null, variant: "thumbnail" | "medium"): PhotoSlot {
  const fill = fillOf(colorOf(photo.uploader.id));
  return photo.canSave ? { kind: "photo", url: photo.imageUrls[variant], fallback: fill } : { kind: "block", fill };
}

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string; size?: number; weight?: 400 | 600 | 700; sub?: boolean }
  | { kind: "number"; text: string }
  | { kind: "polaroid"; slot: PhotoSlot; size?: number }
  | { kind: "grid"; slots: PhotoSlot[] }
  | { kind: "bars"; values: number[]; highlight: number; labels: string[] }
  | { kind: "stripe"; segments: { label: string; weight: number; fill: Fill }[] }
  | { kind: "stats"; items: { value: string; label: string }[] }
  | { kind: "pills"; items: { label: string; fill: Fill }[] }
  | { kind: "gap"; size: number };

export type CardPlan = {
  tone: Tone;
  header: { emoji: string; title: string; year: number };
  blocks: Block[];
  filename: string;
  /** What the card says, for the share sheet's title. */
  title: string;
};

export type PlanContext = {
  wrapped: Pick<Wrapped, "group" | "year" | "final">;
  me: { id: string; displayName: string };
  colorOf: (userId: string) => MemberColor | null;
};

const monthLong = new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" });
const monthNarrow = new Intl.DateTimeFormat(undefined, { month: "narrow", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const monthName = (month: number, format = monthLong) => format.format(new Date(Date.UTC(2000, month - 1, 1)));

const firstName = (displayName: string) => displayName.split(/\s+/)[0] ?? displayName;

/** On a card everyone is named: "You" means nothing to the friend it is shared with. */
const nameOf = (someone: PersonCount) => firstName(someone.user.displayName);

const people = (counts: PersonCount[]) =>
  counts.map((someone) => ({ label: `${nameOf(someone)} ${formatNumber(someone.count)}`, fill: fillOf(someone.color) }));

/** The card for a slide, or null for a slide that isn't worth sharing (the intro). */
export function planShareCard(slide: WrappedSlide, { wrapped, me, colorOf }: PlanContext): CardPlan | null {
  const { year, group } = wrapped;
  const header = { emoji: group.emoji, title: group.name, year };
  const card = (tone: Tone, blocks: Block[], name: string, title: string): CardPlan => ({
    tone,
    header,
    blocks,
    filename: `friendship-wrapped-${year}-${name}.png`,
    title,
  });
  const title = (what: string) => `${group.name} ${year} Wrapped: ${what}`;

  switch (slide.type) {
    case "intro":
      return null;

    case "photos": {
      const blocks: Block[] = [
        { kind: "text", text: "We took", size: 72 },
        { kind: "number", text: formatNumber(slide.total) },
        { kind: "text", text: `${nounFor(slide.total, "photo")} together.`, size: 72 },
      ];
      if (slide.byUser.length > 1) {
        blocks.push({ kind: "gap", size: 24 });
        blocks.push({
          kind: "stripe",
          segments: slide.byUser.map((someone) => ({ label: `${nameOf(someone)} ${formatNumber(someone.count)}`, weight: someone.count, fill: fillOf(someone.color) })),
        });
      }
      return card(PAPER, blocks, "photos", title(`${formatNumber(slide.total)} ${nounFor(slide.total, "photo")}`));
    }

    case "topPhotographer": {
      const blocks: Block[] = [
        { kind: "heading", text: `${nameOf(slide.top)} took the most photos.` },
        { kind: "text", text: `${formatNumber(slide.top.count)} ${nounFor(slide.top.count, "photo")}`, size: 88, weight: 700 },
      ];
      if (slide.runnersUp.length > 0) {
        blocks.push({
          kind: "pills",
          items: slide.runnersUp.map((someone, index) => ({ label: `${index + 2}. ${nameOf(someone)} ${formatNumber(someone.count)}`, fill: { background: "rgba(0,0,0,0.12)", ink: personTone(slide.top.color).ink } })),
        });
      }
      return card(personTone(slide.top.color), blocks, "top-photographer", title("top photographer"));
    }

    case "busiestMonth": {
      const blocks: Block[] = [
        { kind: "heading", text: `${monthName(slide.month)} was our biggest month.` },
        { kind: "bars", values: slide.byMonth, highlight: slide.month - 1, labels: slide.byMonth.map((_, index) => monthName(index + 1, monthNarrow)) },
      ];
      const who = slide.byUser.filter((someone) => someone.count > 0);
      if (who.length > 0) blocks.push({ kind: "pills", items: people(who) });
      if (slide.busiestDay && slide.busiestDay.count > 1) {
        blocks.push({
          kind: "text",
          text: `Our busiest day was ${dayLong.format(new Date(`${slide.busiestDay.date}T00:00:00Z`))}: ${formatNumber(slide.busiestDay.count)} photos.`,
          size: 40,
          weight: 400,
          sub: true,
        });
      }
      return card(NIGHT, blocks, "busiest-month", title(`${monthName(slide.month)} was our biggest month`));
    }

    case "mostReactedPhoto": {
      const poster = firstName(slide.photo.uploader.displayName);
      return card(
        personTone(colorOf(slide.photo.uploader.id)),
        [
          { kind: "heading", text: "The one everyone reacted to." },
          { kind: "polaroid", slot: photoSlot(slide.photo, colorOf, "medium") },
          { kind: "text", text: `${formatNumber(slide.count)} ${nounFor(slide.count, "reaction")}`, size: 72, weight: 700 },
          { kind: "text", text: `Posted by ${poster} on ${formatDayMonth(slide.photo.createdAt)}`, size: 44, weight: 400 },
        ],
        "most-reacted-photo",
        title("the photo everyone reacted to"),
      );
    }

    case "reactions": {
      const blocks: Block[] = [
        { kind: "text", text: "We sent", size: 72 },
        { kind: "number", text: formatNumber(slide.total) },
        { kind: "text", text: `${nounFor(slide.total, "reaction")}.`, size: 72 },
      ];
      if (slide.comments > 0) {
        blocks.push({ kind: "text", text: `…and wrote ${formatNumber(slide.comments)} ${nounFor(slide.comments, "comment")}.`, size: 56, weight: 600 });
      }
      if (slide.topReactor) {
        blocks.push({
          kind: "pills",
          items: [{ label: `${nameOf(slide.topReactor)} reacted the most · ${formatNumber(slide.topReactor.count)}`, fill: fillOf(slide.topReactor.color) }],
        });
      }
      return card(PAPER, blocks, "reactions", title(`${formatNumber(slide.total)} ${nounFor(slide.total, "reaction")}`));
    }

    case "collage":
      return card(
        NIGHT,
        [
          { kind: "heading", text: `${year} in pictures.` },
          { kind: "grid", slots: slide.photos.map((photo) => photoSlot(photo, colorOf, "thumbnail")) },
        ],
        "in-pictures",
        title("in pictures"),
      );

    case "you": {
      const blocks: Block[] = [
        { kind: "heading", text: `${firstName(me.displayName)}'s ${year}` },
        {
          kind: "stats",
          items: [
            { value: formatNumber(slide.photos), label: nounFor(slide.photos, "photo") },
            { value: formatNumber(slide.reactionsReceived), label: `${nounFor(slide.reactionsReceived, "reaction")} got` },
            { value: formatNumber(slide.reactionsGiven), label: `${nounFor(slide.reactionsGiven, "reaction")} sent` },
            { value: formatNumber(slide.commentsWritten), label: `${nounFor(slide.commentsWritten, "comment")} written` },
          ],
        },
      ];
      if (slide.bestPhoto) {
        blocks.push({ kind: "polaroid", slot: photoSlot(slide.bestPhoto.photo, colorOf, "medium"), size: 520 });
        blocks.push({ kind: "text", text: `My most loved: ${formatNumber(slide.bestPhoto.count)} ${nounFor(slide.bestPhoto.count, "reaction")}`, size: 48, weight: 600 });
      }
      if (slide.busiestMonth) {
        blocks.push({ kind: "text", text: `I posted the most in ${monthName(slide.busiestMonth.month)}.`, size: 44, weight: 400 });
      }
      return card(personTone(colorOf(me.id)), blocks, "my-year", title(`${firstName(me.displayName)}'s year`));
    }

    case "outro": {
      const blocks: Block[] = [
        { kind: "heading", text: "That's our year together." },
        {
          kind: "stats",
          items: [
            { value: formatNumber(slide.photos), label: nounFor(slide.photos, "photo") },
            { value: formatNumber(slide.reactions), label: nounFor(slide.reactions, "reaction") },
            { value: formatNumber(slide.comments), label: nounFor(slide.comments, "comment") },
            { value: formatNumber(slide.people), label: nounFor(slide.people, "friend") },
          ],
        },
      ];
      if (!wrapped.final) blocks.push({ kind: "text", text: `And ${year} isn't over yet.`, size: 48, weight: 600 });
      return card(PAPER, blocks, "together", title("our year together"));
    }
  }
}

/** Every image URL a card will load. A colour block has none, so a photo that can't be saved is never fetched. */
export function planImageUrls(plan: CardPlan): string[] {
  const slots = plan.blocks.flatMap((block) => (block.kind === "polaroid" ? [block.slot] : block.kind === "grid" ? block.slots : []));
  return [...new Set(slots.flatMap((slot) => (slot.kind === "photo" ? [slot.url] : [])))];
}
