import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import { formatDayMonth, formatNumber, nounFor } from "../../../lib/format";
import { memberFill, type MemberColor } from "../../../lib/member-colors";
import { useCurrentUser } from "../../auth/hooks";
import { GroupAvatar } from "../../groups/components/GroupAvatar";
import { useGroupPeople } from "../../groups/hooks";
import { PhotoImage } from "../../photos/components/PhotoImage";
import type { Photo } from "../../photos/types";
import { REACTIONS, reactionByType } from "../../reactions/reactions";
import type { PersonCount, Wrapped, WrappedSlide } from "../types";
import { AnimatedNumber } from "./AnimatedNumber";

/**
 * Each slide is one of three looks: paper (the app's own light or dark), night (black), or
 * flooded in one person's colour when the slide is about them. Colour still only means a person.
 */
export type SlideTone = { background: string; ink: string };

const PAPER: SlideTone = { background: "var(--bg)", ink: "var(--fg)" };
const NIGHT: SlideTone = { background: "#000000", ink: "#ffffff" };
const person = (color: MemberColor | null): SlideTone => {
  const fill = memberFill(color);
  return { background: fill.background, ink: fill.ink };
};

/** The slide's colours, so the story's progress bar and buttons can match. */
export function slideTone(slide: WrappedSlide, colorOf: (userId: string) => MemberColor | null, meId: string): SlideTone {
  switch (slide.type) {
    case "you":
      return person(colorOf(meId));
    case "topPhotographer":
      return person(slide.top.color ?? colorOf(slide.top.user.id));
    case "mostReactedPhoto":
      return person(colorOf(slide.photo.uploader.id));
    case "busiestMonth":
    case "collage":
      return NIGHT;
    default:
      return PAPER;
  }
}

function SlideFrame({ tone, center = false, bleed, children }: { tone: SlideTone; center?: boolean; bleed?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex size-full flex-col overflow-hidden" style={{ background: tone.background, color: tone.ink }}>
      <div
        // safe: content that doesn't fit a short screen starts at the top instead of being cut off at both ends.
        className={`relative flex flex-1 flex-col justify-center-safe gap-[clamp(0.75rem,3dvh,1.5rem)] px-6 pt-[calc(6.5rem+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))] ${
          center ? "items-center text-center" : ""
        }`}
      >
        {children}
      </div>
      {bleed}
    </div>
  );
}

type RiseProps = { delay?: number; className?: string; style?: CSSProperties; as?: "span" | "div"; children: ReactNode };

/** Fades and slides its content up into place, after `delay` ms. */
function Rise({ delay = 0, className = "", style, as: Element = "span", children }: RiseProps) {
  return (
    <Element className={`block animate-rise motion-reduce:animate-none ${className}`} style={{ animationDelay: `${delay}ms`, ...style }}>
      {children}
    </Element>
  );
}

const headline = "text-[clamp(1.875rem,9.5cqw,2.25rem)] leading-[1.05] font-semibold font-stretch-112% text-balance";

/** Big numbers get as large as fits the story's width (cqw: the story is a size container). */
function bigNumberClasses(value: number): string {
  const length = formatNumber(value).length;
  const size =
    length <= 3 ? "text-[clamp(4.5rem,36cqw,8.5rem)]" : length <= 5 ? "text-[clamp(4rem,28cqw,7rem)]" : length <= 7 ? "text-[clamp(3rem,21cqw,5rem)]" : "text-[clamp(2.5rem,16cqw,4rem)]";
  return `${size} leading-[0.95] font-bold font-stretch-112% tracking-tight`;
}

const monthLong = new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" });
const monthNarrow = new Intl.DateTimeFormat(undefined, { month: "narrow", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** `month` is 1–12. */
const monthName = (month: number, format = monthLong) => format.format(new Date(Date.UTC(2000, month - 1, 1)));

/** "You" for the person watching, otherwise their first name. */
function useNameOf() {
  const me = useCurrentUser();
  return (someone: PersonCount) => (someone.user.id === me.id ? "You" : someone.user.displayName.split(/\s+/)[0]!);
}

function IntroSlide({ wrapped }: { wrapped: Wrapped }) {
  return (
    <SlideFrame tone={PAPER} center>
      <span className="block animate-pop motion-reduce:animate-none">
        <GroupAvatar group={wrapped.group} size={128} />
      </span>
      <Rise delay={250} className="text-lg font-semibold wrap-break-word">
        {wrapped.group.name}
      </Rise>
      <h2 className="font-semibold font-stretch-125%">
        <Rise delay={450} className="text-3xl">
          Your
        </Rise>
        <Rise delay={600} className="text-[clamp(4.5rem,30cqw,6.5rem)] leading-none font-bold tracking-tight">
          {wrapped.year}
        </Rise>
        <Rise delay={750} className="text-5xl">
          Wrapped
        </Rise>
      </h2>
      {!wrapped.final && (
        <Rise delay={1000} className="rounded-full bg-surface px-4 py-1.5 text-sm font-semibold">
          The year so far: it isn't over yet
        </Rise>
      )}
      <Rise delay={1600} className="absolute inset-x-0 bottom-[calc(2.5rem+env(safe-area-inset-bottom))] text-sm text-sub">
        Tap to skip ahead, hold to pause
      </Rise>
    </SlideFrame>
  );
}

/** Everyone's share of the photos, as columns as wide as their share, each in their colour. */
function ShareStripe({ people }: { people: PersonCount[] }) {
  const nameOf = useNameOf();
  if (people.length === 0) return null;
  const total = people.reduce((sum, someone) => sum + someone.count, 0);

  return (
    <div
      role="img"
      aria-label={people.map((someone) => `${nameOf(someone)} ${formatNumber(someone.count)}`).join(", ")}
      className="absolute inset-x-0 bottom-0 flex h-[38%] origin-bottom animate-grow-up overflow-hidden rounded-t-[1.75rem] motion-reduce:animate-none"
      style={{ animationDelay: "900ms" }}
    >
      {people.map((someone) => {
        const fill = memberFill(someone.color);
        return (
          <div
            key={someone.user.id}
            className="flex min-w-0 items-end justify-center pb-[calc(1.75rem+env(safe-area-inset-bottom))]"
            style={{ flexGrow: someone.count / total, flexBasis: 0, background: fill.background, color: fill.ink }}
          >
            <span className="rotate-180 text-lg font-medium whitespace-nowrap [writing-mode:vertical-rl]">
              {nameOf(someone)}
              <span className="ms-2 font-bold">{formatNumber(someone.count)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PhotosSlide({ total, photographerCount, byUser = [] }: Extract<WrappedSlide, { type: "photos" }>) {
  return (
    <SlideFrame tone={PAPER} bleed={<ShareStripe people={byUser} />}>
      <div className="flex flex-1 flex-col gap-3 pb-[38%]">
        <h2 className="flex flex-col gap-1 font-semibold font-stretch-112%">
          <Rise className="text-3xl">You took</Rise>
          <Rise delay={200} className={bigNumberClasses(total)}>
            <AnimatedNumber value={total} delayMs={200} />
          </Rise>
          <Rise delay={400} className="text-3xl">
            {nounFor(total, "photo")} together.
          </Rise>
        </h2>
        {photographerCount > 1 && (
          <Rise delay={700} className="text-base text-sub">
            {photographerCount} of you shot them.{byUser.length > 1 ? " Here's how they split." : ""}
          </Rise>
        )}
      </div>
    </SlideFrame>
  );
}

function TopPhotographerSlide({ top, runnersUp }: { top: PersonCount; runnersUp: PersonCount[] }) {
  const nameOf = useNameOf();

  return (
    <SlideFrame tone={person(top.color)}>
      <span className="block w-fit animate-pop rounded-full ring-6 ring-current/25 motion-reduce:animate-none" style={{ animationDelay: "150ms" }}>
        <Avatar name={top.user.displayName} src={top.user.avatarUrl} color={top.color} size="xl" />
      </span>
      <h2 className={headline}>
        <Rise delay={350}>{nameOf(top)} took the most photos.</Rise>
      </h2>
      <Rise delay={550} className="text-[1.75rem] font-bold font-stretch-112%">
        <AnimatedNumber value={top.count} delayMs={550} /> {nounFor(top.count, "photo")}
      </Rise>
      {runnersUp.length > 0 && (
        <Rise delay={1000} as="div">
          <ol className="flex flex-col gap-2" aria-label="Runners-up">
            {runnersUp.map((someone, index) => (
              <li key={someone.user.id} className="flex items-center gap-3 rounded-full bg-black/10 py-1.5 pr-4 pl-1.5">
                <Avatar name={someone.user.displayName} src={someone.user.avatarUrl} color={someone.color} size="md" />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {index + 2}. {nameOf(someone)}
                </span>
                <span className="text-[0.9375rem] font-semibold tabular-nums">{formatNumber(someone.count)}</span>
              </li>
            ))}
          </ol>
        </Rise>
      )}
    </SlideFrame>
  );
}

function BusiestMonthSlide({ month, count, byMonth, busiestDay, byUser = [] }: Extract<WrappedSlide, { type: "busiestMonth" }>) {
  const nameOf = useNameOf();
  const most = Math.max(...byMonth, 1);
  const people = byUser.filter((someone) => someone.count > 0);

  return (
    <SlideFrame tone={NIGHT}>
      <h2 className={headline}>
        <Rise>{monthName(month)} was your biggest month.</Rise>
      </h2>
      <figure aria-label={`Photos per month. ${monthName(month)} is highest with ${formatNumber(count)}.`} className="m-0 flex flex-col gap-2">
        <div aria-hidden className="flex h-[min(17.5rem,30dvh)] items-end gap-1.5">
          {byMonth.map((photos, index) => {
            const isBusiest = index + 1 === month;
            return (
              <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                {isBusiest && <span className="text-[0.9375rem] font-bold">{formatNumber(count)}</span>}
                <div
                  className="flex w-full origin-bottom animate-grow-up flex-col-reverse gap-0.5 overflow-hidden rounded-t-lg rounded-b-sm motion-reduce:animate-none"
                  style={{ height: photos === 0 ? "2px" : `${Math.max(4, (photos / most) * 100)}%`, animationDelay: `${300 + index * 60}ms`, background: isBusiest && people.length ? "transparent" : isBusiest ? "#ffffff" : "#5c5c59" }}
                >
                  {isBusiest &&
                    people.map((someone) => <span key={someone.user.id} style={{ flexGrow: someone.count, flexBasis: 0, background: memberFill(someone.color).background }} />)}
                </div>
              </div>
            );
          })}
        </div>
        <div aria-hidden className="flex gap-1.5 text-center text-[0.8125rem]">
          {byMonth.map((_, index) => (
            <span key={index} className={`flex-1 ${index + 1 === month ? "font-semibold text-white" : "text-[#8a8a86]"}`}>
              {monthName(index + 1, monthNarrow)}
            </span>
          ))}
        </div>
      </figure>
      {people.length > 0 && (
        <Rise delay={1200} as="div" className="flex flex-wrap gap-x-4 gap-y-2 text-[0.9375rem]">
          {people.map((someone) => (
            <span key={someone.user.id} className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-full" style={{ background: memberFill(someone.color).background }} />
              {nameOf(someone)} {formatNumber(someone.count)}
            </span>
          ))}
        </Rise>
      )}
      {busiestDay && busiestDay.count > 1 && (
        <Rise delay={1700} className="text-base text-[#a8a8a4]">
          Your busiest day was {dayLong.format(new Date(`${busiestDay.date}T00:00:00Z`))}: {formatNumber(busiestDay.count)} photos.
        </Rise>
      )}
    </SlideFrame>
  );
}

/** Where the reaction stickers sit around the photo. */
const STICKER_SPOTS: CSSProperties[] = [
  { top: "-1.25rem", right: "-1rem", rotate: "8deg" },
  { top: "40%", left: "-1.5rem", rotate: "-9deg" },
  { bottom: "3rem", right: "-1.25rem", rotate: "5deg" },
  { bottom: "-1.25rem", left: "1.25rem", rotate: "-5deg" },
  { top: "-1rem", left: "2rem", rotate: "-6deg" },
  { bottom: "40%", right: "-1.5rem", rotate: "7deg" },
];

function MostReactedPhotoSlide({ photo, count, groupId }: { photo: Photo; count: number; groupId: string }) {
  const { memberOf, colorOf } = useGroupPeople(groupId);
  const me = useCurrentUser();
  const reactors = (photo.reactions.reactors ?? []).slice(0, STICKER_SPOTS.length);
  const poster = photo.uploader.id === me.id ? "you" : photo.uploader.displayName.split(/\s+/)[0];

  return (
    <SlideFrame tone={person(colorOf(photo.uploader.id))} center>
      <h2 className={headline}>
        <Rise>The one everyone reacted to.</Rise>
      </h2>
      <span className="relative mt-4 block animate-pop motion-reduce:animate-none" style={{ animationDelay: "300ms", width: "min(78%, 18rem)" }}>
        <span className="block -rotate-3 rounded-[2.25rem] bg-white p-2.5">
          <PhotoImage photo={photo} variant="medium" priority className="aspect-square rounded-[1.625rem]" />
        </span>
        {reactors.map((reactor, index) => {
          const fill = memberFill(colorOf(reactor.userId));
          const name = reactor.userId === me.id ? "You" : (memberOf(reactor.userId)?.user.displayName.split(/\s+/)[0] ?? "");
          return (
            <span
              key={reactor.userId}
              className="absolute flex animate-pop items-center gap-1.5 rounded-full py-2 pr-3.5 pl-2.5 text-lg font-semibold whitespace-nowrap shadow-[0_0_0_4px_#ffffff] motion-reduce:animate-none"
              style={{ ...STICKER_SPOTS[index], background: fill.background, color: fill.ink, animationDelay: `${700 + index * 150}ms` }}
            >
              <span aria-hidden>{reactionByType[reactor.type].emoji}</span>
              {name}
            </span>
          );
        })}
      </span>
      <Rise delay={1300} as="div" className="mt-4 flex flex-col gap-1">
        <span className="text-2xl font-semibold">
          <AnimatedNumber value={count} delayMs={1300} /> {nounFor(count, "reaction")}
        </span>
        <span className="text-base wrap-anywhere">
          Posted by {poster} on {formatDayMonth(photo.createdAt)}
        </span>
      </Rise>
    </SlideFrame>
  );
}

/** Reactions drifting up the screen, at fixed places so it looks the same every time. */
const floaters = [
  { left: 6, delay: 0 },
  { left: 22, delay: 1.6 },
  { left: 38, delay: 0.8 },
  { left: 54, delay: 2.4 },
  { left: 70, delay: 0.4 },
  { left: 86, delay: 2 },
  { left: 14, delay: 3 },
  { left: 62, delay: 3.4 },
];

function FloatingReactions() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
      {floaters.map(({ left, delay }, index) => (
        <span key={index} className="absolute -bottom-10 animate-float-up text-4xl" style={{ left: `${left}%`, animationDelay: `${delay}s` }}>
          {REACTIONS[index % REACTIONS.length]!.emoji}
        </span>
      ))}
    </div>
  );
}

function ReactionsSlide({ total, comments, topReactor }: Extract<WrappedSlide, { type: "reactions" }>) {
  const nameOf = useNameOf();
  const fill = topReactor ? memberFill(topReactor.color) : null;

  return (
    <SlideFrame tone={PAPER} bleed={<FloatingReactions />}>
      <h2 className="flex flex-col gap-1 font-semibold font-stretch-112%">
        <Rise className="text-3xl">You sent</Rise>
        <Rise delay={200} className={bigNumberClasses(total)}>
          <AnimatedNumber value={total} delayMs={200} />
        </Rise>
        <Rise delay={400} className="text-3xl">
          {nounFor(total, "reaction")}.
        </Rise>
      </h2>
      {comments > 0 && (
        <Rise delay={1600} className="text-xl font-semibold">
          …and wrote <AnimatedNumber value={comments} delayMs={1600} durationMs={900} /> {nounFor(comments, "comment")}.
        </Rise>
      )}
      {topReactor && fill && (
        <Rise delay={2200} as="div">
          <span className="relative z-10 flex items-center gap-3 rounded-full py-2 pr-5 pl-2" style={{ background: fill.background, color: fill.ink }}>
            <Avatar name={topReactor.user.displayName} src={topReactor.user.avatarUrl} color={topReactor.color} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{nameOf(topReactor)} reacted the most</span>
              <span className="block text-sm">
                {formatNumber(topReactor.count)} {nounFor(topReactor.count, "reaction")}
              </span>
            </span>
          </span>
        </Rise>
      )}
    </SlideFrame>
  );
}

const tilts = [-3, 2, -1.5, 2.5, -2, 1.5, -2.5, 3, -1];

function CollageSlide({ photos, year }: { photos: Photo[]; year: number }) {
  return (
    <SlideFrame tone={NIGHT} center>
      <h2 className={headline}>
        <Rise>{year} in pictures.</Rise>
      </h2>
      <ul className={`grid w-full gap-3 ${photos.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
        {photos.map((photo, index) => (
          <li key={photo.id} style={{ rotate: `${tilts[index % tilts.length]}deg` }}>
            <span className="block animate-pop rounded-[1.125rem] bg-white p-1.5 motion-reduce:animate-none" style={{ animationDelay: `${350 + index * 140}ms` }}>
              <PhotoImage photo={photo} variant="thumbnail" priority className="aspect-square rounded-xl" />
            </span>
          </li>
        ))}
      </ul>
    </SlideFrame>
  );
}

/** Your own year in the group, in your colour. Only you see it, and it holds nothing about anyone else. */
function YouSlide({ year, groupId, ...you }: Extract<WrappedSlide, { type: "you" }> & { year: number; groupId: string }) {
  const { photos, reactionsGiven, commentsWritten, reactionsReceived, busiestMonth, bestPhoto } = you;
  const me = useCurrentUser();
  const { colorOf } = useGroupPeople(groupId);
  const tiles = [
    photos > 0 && { value: photos, label: nounFor(photos, "photo") },
    reactionsReceived > 0 && { value: reactionsReceived, label: `${nounFor(reactionsReceived, "reaction")} on your photos` },
    reactionsGiven > 0 && { value: reactionsGiven, label: `${nounFor(reactionsGiven, "reaction")} sent` },
    commentsWritten > 0 && { value: commentsWritten, label: `${nounFor(commentsWritten, "comment")} written` },
  ].filter((tile): tile is { value: number; label: string } => tile !== false);

  return (
    <SlideFrame tone={person(colorOf(me.id))} center>
      <h2 className={headline}>
        <Rise>Your {year}, just you.</Rise>
      </h2>
      <Rise delay={250} as="div" className="w-full">
        <dl className="grid grid-cols-2 gap-3 text-left">
          {tiles.map(({ value, label }, index) => (
            <div key={label} className="flex flex-col-reverse rounded-3xl bg-current/10 px-4 py-3">
              <dt className="text-sm opacity-80">{label}</dt>
              <dd className="text-3xl font-bold font-stretch-112%">
                <AnimatedNumber value={value} delayMs={250 + index * 120} durationMs={1000} />
              </dd>
            </div>
          ))}
        </dl>
      </Rise>
      {bestPhoto && (
        <Rise delay={900} as="div" className="flex w-full items-center gap-4 text-left">
          <span className="block w-[34%] shrink-0 -rotate-3 rounded-[1.5rem] bg-white p-1.5">
            <PhotoImage photo={bestPhoto.photo} variant="medium" className="aspect-square rounded-[1.125rem]" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-lg font-semibold">Your most loved photo</span>
            <span className="text-base">
              {formatNumber(bestPhoto.count)} {nounFor(bestPhoto.count, "reaction")}
            </span>
          </span>
        </Rise>
      )}
      {busiestMonth && (
        <Rise delay={1200} className="text-base">
          You posted the most in {monthName(busiestMonth.month)}: {formatNumber(busiestMonth.count)} {nounFor(busiestMonth.count, "photo")}.
        </Rise>
      )}
    </SlideFrame>
  );
}

type OutroProps = Extract<WrappedSlide, { type: "outro" }> & { wrapped: Wrapped; onRestart: () => void; onClose: () => void };

function OutroSlide({ photos, reactions, comments, people, wrapped, onRestart, onClose }: OutroProps) {
  const totals = [
    { value: photos, label: nounFor(photos, "photo") },
    { value: reactions, label: nounFor(reactions, "reaction") },
    { value: comments, label: nounFor(comments, "comment") },
    { value: people, label: nounFor(people, "friend") },
  ];

  return (
    <SlideFrame tone={PAPER} center>
      <span className="block animate-pop motion-reduce:animate-none">
        <GroupAvatar group={wrapped.group} size={88} />
      </span>
      <h2 className={headline}>
        <Rise delay={200}>That's your year together.</Rise>
      </h2>
      <Rise delay={500} as="div" className="w-full">
        <dl className="grid grid-cols-2 gap-3">
          {totals.map(({ value, label }) => (
            <div key={label} className="flex flex-col-reverse rounded-3xl bg-surface px-4 py-3">
              <dt className="text-sm text-sub">{label}</dt>
              <dd className="text-3xl font-bold font-stretch-112%">
                <AnimatedNumber value={value} delayMs={500} durationMs={1000} />
              </dd>
            </div>
          ))}
        </dl>
      </Rise>
      {!wrapped.final && (
        <Rise delay={900} className="font-semibold">
          And {wrapped.year} isn't over yet. Keep them coming.
        </Rise>
      )}
      <Rise delay={1100} as="div" className="flex gap-3">
        <button type="button" onClick={onRestart} className="inline-flex min-h-12 items-center rounded-full bg-surface px-6 font-semibold transition hover:bg-line">
          Watch again
        </button>
        <button type="button" onClick={onClose} className="inline-flex min-h-12 items-center rounded-full bg-inverse px-6 font-semibold text-on-inverse transition hover:opacity-90">
          Done
        </button>
      </Rise>
    </SlideFrame>
  );
}

type StorySlideProps = { slide: WrappedSlide; wrapped: Wrapped; onRestart: () => void; onClose: () => void };

/** The slide's content, in its own colours and motion. */
export function StorySlide({ slide, wrapped, onRestart, onClose }: StorySlideProps) {
  switch (slide.type) {
    case "intro":
      return <IntroSlide wrapped={wrapped} />;
    case "photos":
      return <PhotosSlide {...slide} />;
    case "topPhotographer":
      return <TopPhotographerSlide {...slide} />;
    case "busiestMonth":
      return <BusiestMonthSlide {...slide} />;
    case "mostReactedPhoto":
      return <MostReactedPhotoSlide photo={slide.photo} count={slide.count} groupId={wrapped.group.id} />;
    case "reactions":
      return <ReactionsSlide {...slide} />;
    case "collage":
      return <CollageSlide photos={slide.photos} year={wrapped.year} />;
    case "you":
      return <YouSlide {...slide} year={wrapped.year} groupId={wrapped.group.id} />;
    case "outro":
      return <OutroSlide {...slide} wrapped={wrapped} onRestart={onRestart} onClose={onClose} />;
  }
}

/** Images the story will show, so they can load before their slide comes up. */
export function slideImageUrls(slide: WrappedSlide): string[] {
  if (slide.type === "mostReactedPhoto") return [slide.photo.imageUrls.medium];
  if (slide.type === "collage") return slide.photos.map((photo) => photo.imageUrls.thumbnail);
  if (slide.type === "you" && slide.bestPhoto) return [slide.bestPhoto.photo.imageUrls.medium];
  return [];
}
