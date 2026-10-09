import { describe, expect, it } from "vitest";
import type { MemberColor } from "../../../lib/member-colors";
import type { Photo } from "../../photos/types";
import type { PersonCount, WrappedSlide } from "../types";
import { fillOf, photoSlot, planImageUrls, planShareCard, type Block, type CardPlan, type PlanContext } from "./card-plan";

const colors: Record<string, MemberColor> = { me: "COBALT", ada: "LIME", bob: "TOMATO", cy: "SUN" };
const colorOf = (userId: string) => colors[userId] ?? null;

const context: PlanContext = {
  wrapped: { group: { id: "g1", name: "The Boys", emoji: "🍻" }, year: 2026, final: true },
  me: { id: "me", displayName: "Mia Novak" },
  colorOf,
};

function photo(id: string, uploader: string, canSave: boolean): Photo {
  return {
    id,
    groupId: "g1",
    caption: null,
    width: 100,
    height: 100,
    createdAt: "2026-05-04T10:00:00.000Z",
    uploader: { id: uploader, username: uploader, displayName: `${uploader[0]!.toUpperCase()}${uploader.slice(1)} Smith`, avatarUrl: null },
    imageUrls: {
      thumbnail: `/api/photos/${id}/images/thumbnail`,
      medium: `/api/photos/${id}/images/medium`,
      full: `/api/photos/${id}/images/full`,
    },
    canDelete: false,
    canInteract: true,
    reactions: { counts: {}, total: 0, mine: null },
    commentCount: 0,
    isFavorite: false,
    canSave,
  } as Photo;
}

const person = (id: string, name: string, count: number, color: MemberColor | null): PersonCount => ({
  user: { id, username: id, displayName: name, avatarUrl: null },
  count,
  color,
});

const slides: Record<string, WrappedSlide> = {
  intro: { type: "intro" },
  photos: {
    type: "photos",
    total: 120,
    photographerCount: 3,
    byUser: [person("ada", "Ada Lovelace", 70, "LIME"), person("bob", "Bob Smith", 50, "TOMATO")],
  },
  topPhotographer: {
    type: "topPhotographer",
    top: person("ada", "Ada Lovelace", 70, "LIME"),
    runnersUp: [person("bob", "Bob Smith", 50, "TOMATO")],
  },
  busiestMonth: {
    type: "busiestMonth",
    month: 8,
    count: 30,
    byMonth: [1, 2, 3, 4, 5, 6, 7, 30, 9, 10, 11, 12],
    busiestDay: { date: "2026-08-15", count: 6 },
    byUser: [person("ada", "Ada Lovelace", 20, "LIME"), person("bob", "Bob Smith", 10, "TOMATO")],
  },
  mostReactedPhoto: { type: "mostReactedPhoto", photo: photo("p1", "ada", true), count: 9 },
  reactions: { type: "reactions", total: 400, comments: 55, topReactor: person("bob", "Bob Smith", 150, "TOMATO") },
  collage: { type: "collage", photos: [photo("c1", "ada", true), photo("c2", "bob", false), photo("c3", "cy", true)] },
  you: {
    type: "you",
    photos: 42,
    reactionsGiven: 100,
    commentsWritten: 12,
    reactionsReceived: 210,
    commentsReceived: 30,
    busiestMonth: { month: 6, count: 11 },
    bestPhoto: { photo: photo("mine", "me", true), count: 14 },
  },
  outro: { type: "outro", photos: 120, reactions: 400, comments: 55, people: 5 },
};

const plan = (name: string, ctx = context) => planShareCard(slides[name]!, ctx)!;

/** Month names follow the viewer's language, so the tests ask for them the same way. */
const monthName = (month: number) => new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1)));

/** Every piece of text on a card, in one string. */
function textOf(card: CardPlan): string {
  const parts = (block: Block): string[] => {
    switch (block.kind) {
      case "heading":
      case "text":
      case "number":
        return [block.text];
      case "stats":
        return block.items.flatMap((item) => [item.value, item.label]);
      case "pills":
        return block.items.map((item) => item.label);
      case "stripe":
        return block.segments.map((segment) => segment.label);
      case "bars":
        return block.labels;
      default:
        return [];
    }
  };
  return [card.header.title, ...card.blocks.flatMap(parts)].join("\n");
}

describe("which photos go on a card", () => {
  it("shows a photo the viewer may save, and a block of its uploader's colour where they may not", () => {
    const allowed = photoSlot(photo("p1", "ada", true), colorOf, "medium");
    const refused = photoSlot(photo("p2", "bob", false), colorOf, "medium");

    expect(allowed).toEqual({ kind: "photo", url: "/api/photos/p1/images/medium", fallback: fillOf("LIME") });
    expect(refused).toEqual({ kind: "block", fill: fillOf("TOMATO") });
  });

  it("never mentions the image of a photo that may not be saved, so it isn't even loaded", () => {
    const card = plan("collage");

    expect(planImageUrls(card)).toEqual(["/api/photos/c1/images/thumbnail", "/api/photos/c3/images/thumbnail"]);
    expect(JSON.stringify(card)).not.toContain("c2");
  });

  it("covers the most reacted photo too, in the poster's colour", () => {
    const refused = planShareCard({ type: "mostReactedPhoto", photo: photo("p9", "bob", false), count: 3 }, context)!;

    expect(planImageUrls(refused)).toEqual([]);
    expect(refused.blocks.find((block) => block.kind === "polaroid")).toMatchObject({ slot: { kind: "block", fill: fillOf("TOMATO") } });
    expect(JSON.stringify(refused)).not.toContain("p9");
    expect(refused.tone.background).toBe(fillOf("TOMATO").background);
  });

  it("uses a neutral block for someone who has left the group", () => {
    expect(photoSlot(photo("p3", "ghost", false), colorOf, "medium")).toEqual({ kind: "block", fill: fillOf(null) });
  });

  it("keeps the viewer's own best photo on their personal card", () => {
    expect(planImageUrls(plan("you"))).toEqual(["/api/photos/mine/images/medium"]);
  });

  it("covers even the viewer's best photo if it came back as not saveable", () => {
    const card = planShareCard({ ...(slides.you as Extract<WrappedSlide, { type: "you" }>), bestPhoto: { photo: photo("mine", "me", false), count: 5 } }, context)!;

    expect(planImageUrls(card)).toEqual([]);
  });

  it("loads each image once, in grids with repeats", () => {
    const repeated = planShareCard({ type: "collage", photos: [photo("a", "ada", true), photo("a", "ada", true)] }, context)!;

    expect(planImageUrls(repeated)).toEqual(["/api/photos/a/images/thumbnail"]);
  });
});

describe("what a card says", () => {
  it("names everyone by first name, because 'you' means nothing to whoever it is shared with", () => {
    const text = [plan("topPhotographer"), plan("reactions"), plan("busiestMonth"), plan("mostReactedPhoto")].map(textOf).join("\n");

    expect(text).toContain("Ada took the most photos.");
    expect(text).toContain("Bob reacted the most");
    expect(text).toContain("Posted by Ada");
    expect(text.toLowerCase()).not.toMatch(/\byou\b/);
    expect(text).not.toContain("Lovelace");
    expect(text).not.toContain("Smith");
  });

  it("says 'we' about the group and 'my' on a personal card", () => {
    expect(textOf(plan("photos"))).toContain("We took");
    expect(textOf(plan("photos"))).toContain("120");
    expect(textOf(plan("outro"))).toContain("That's our year together.");
    const mine = textOf(plan("you"));
    expect(mine).toContain("Mia's 2026");
    expect(mine).toContain("My most loved: 14 reactions");
    expect(mine).toContain(`I posted the most in ${monthName(6)}.`);
    expect(mine).not.toContain("Novak");
  });

  it("puts the personal card in the viewer's colour, and the group's in the group's tones", () => {
    expect(plan("you").tone.background).toBe(fillOf("COBALT").background);
    expect(plan("photos").tone.background).toBe("#ffffff");
    expect(plan("collage").tone.background).toBe("#000000");
  });

  it("holds the numbers of the slide", () => {
    const stats = plan("you").blocks.find((block) => block.kind === "stats");
    expect(stats).toMatchObject({
      items: [
        { value: "42", label: "photos" },
        { value: "210", label: "reactions got" },
        { value: "100", label: "reactions sent" },
        { value: "12", label: "comments written" },
      ],
    });
  });

  it("says a year in progress isn't over", () => {
    expect(textOf(plan("outro"))).not.toContain("over yet");
    expect(textOf(plan("outro", { ...context, wrapped: { ...context.wrapped, final: false } }))).toContain("2026 isn't over yet.");
  });

  it("has a name and a title for the share sheet", () => {
    const card = plan("busiestMonth");

    expect(card.filename).toBe("friendship-wrapped-2026-busiest-month.png");
    expect(card.title).toBe(`The Boys 2026 Wrapped: ${monthName(8)} was our biggest month`);
    expect(card.header).toEqual({ emoji: "🍻", title: "The Boys", year: 2026 });
  });
});

describe("which slides can be shared", () => {
  it("is every slide but the intro", () => {
    for (const [name, slide] of Object.entries(slides)) {
      const card = planShareCard(slide, context);
      if (name === "intro") expect(card).toBeNull();
      else expect(card, name).not.toBeNull();
    }
  });
});
