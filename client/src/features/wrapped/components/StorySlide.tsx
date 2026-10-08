import type { ReactNode } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import { formatDayMonth, formatNumber, nounFor } from "../../../lib/format";
import { useCurrentUser } from "../../auth/hooks";
import { PhotoImage } from "../../photos/components/PhotoImage";
import type { Photo } from "../../photos/types";
import { REACTIONS } from "../../reactions/reactions";
import type { PersonCount, Wrapped, WrappedSlide } from "../types";
import { AnimatedNumber } from "./AnimatedNumber";

type Tone = "sunset" | "violet" | "gold" | "ocean" | "night" | "berry";

const toneClasses: Record<Tone, string> = {
  sunset:
    "bg-linear-to-br from-brand-rose via-brand-orange to-brand-gold bg-size-[200%_200%] text-ink-950 animate-pan motion-reduce:animate-none",
  violet: "bg-linear-to-br from-violet-700 via-fuchsia-600 to-brand-rose text-ink-50",
  gold: "bg-linear-to-br from-brand-gold via-brand-orange to-brand-rose text-ink-950",
  ocean: "bg-linear-to-br from-sky-600 via-indigo-600 to-violet-800 text-ink-50",
  night: "bg-ink-950 text-ink-50",
  berry: "bg-linear-to-br from-brand-rose via-rose-700 to-violet-900 text-ink-50",
};

type SlideFrameProps = { tone: Tone; center?: boolean; decoration?: ReactNode; children: ReactNode };

/** A full-screen slide: coloured background, content clear of the progress bar at the top. */
function SlideFrame({ tone, center = false, decoration, children }: SlideFrameProps) {
  return (
    <div className={`relative flex size-full flex-col overflow-hidden ${toneClasses[tone]}`}>
      {decoration}
      <div
        // safe: content that doesn't fit a short screen starts at the top instead of being cut off at both ends.
        className={`relative flex flex-1 flex-col justify-center-safe gap-[clamp(0.75rem,3dvh,1.5rem)] px-7 pt-[calc(6rem+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))] ${
          center ? "items-center text-center" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

type RiseProps = {
  delay?: number;
  className?: string;
  /** A span by default, so it can go inside headings; a div around lists. */
  as?: "span" | "div";
  children: ReactNode;
};

/** Fades and slides its content up into place, after `delay` ms. */
function Rise({ delay = 0, className = "", as: Element = "span", children }: RiseProps) {
  return (
    <Element
      className={`block animate-rise motion-reduce:animate-none ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </Element>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <span className="block text-sm font-bold tracking-[0.2em] uppercase opacity-80">{children}</span>;
}

/** Big numbers get as large as fits the story's width (cqw: the story is a size container). */
function bigNumberClasses(value: number): string {
  const length = formatNumber(value).length;
  const size =
    length <= 3
      ? "text-[clamp(4rem,34cqw,8rem)]"
      : length <= 5
        ? "text-[clamp(3.5rem,26cqw,6rem)]"
        : length <= 7
          ? "text-[clamp(3rem,20cqw,4.5rem)]"
          : "text-[clamp(2.5rem,15cqw,3.75rem)]";
  return `${size} leading-none font-black tracking-tighter`;
}

const monthLong = new Intl.DateTimeFormat(undefined, { month: "long", timeZone: "UTC" });
const monthNarrow = new Intl.DateTimeFormat(undefined, { month: "narrow", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** `month` is 1–12. */
const monthName = (month: number, format = monthLong) => format.format(new Date(Date.UTC(2000, month - 1, 1)));

/** "You" for the person watching, otherwise their name. */
function useNameOf() {
  const me = useCurrentUser();
  return (person: PersonCount) => (person.user.id === me.id ? "You" : person.user.displayName);
}

function IntroSlide({ wrapped }: { wrapped: Wrapped }) {
  return (
    <SlideFrame tone="sunset" center>
      <span
        aria-hidden
        className="grid size-28 animate-pop place-items-center rounded-full bg-white/25 text-6xl shadow-2xl ring-8 ring-white/15 motion-reduce:animate-none"
      >
        {wrapped.group.emoji}
      </span>
      <Rise delay={250} className="text-lg font-bold wrap-break-word">
        {wrapped.group.name}
      </Rise>
      <h2 className="font-black tracking-tight">
        <Rise delay={450} className="text-3xl">
          Your
        </Rise>
        <Rise delay={600} className="text-[clamp(4rem,28cqw,6rem)] leading-none tracking-tighter">
          {wrapped.year}
        </Rise>
        <Rise delay={750} className="text-5xl">
          Wrapped
        </Rise>
      </h2>
      {!wrapped.final && (
        <Rise delay={1000} className="rounded-full bg-ink-950/15 px-4 py-1.5 text-sm font-semibold">
          The year so far: it isn't over yet
        </Rise>
      )}
      <Rise delay={1600} className="absolute inset-x-0 bottom-[calc(2.5rem+env(safe-area-inset-bottom))] text-sm font-semibold opacity-70">
        Tap to skip ahead, hold to pause
      </Rise>
    </SlideFrame>
  );
}

function PhotosSlide({ total, photographerCount }: { total: number; photographerCount: number }) {
  return (
    <SlideFrame tone="violet">
      <h2 className="flex flex-col gap-2 font-black">
        <Rise className="text-3xl">You took</Rise>
        <Rise delay={200} className={bigNumberClasses(total)}>
          <AnimatedNumber value={total} delayMs={200} />
        </Rise>
        <Rise delay={400} className="text-3xl">
          {nounFor(total, "photo")} together.
        </Rise>
      </h2>
      {photographerCount > 1 && (
        <Rise delay={1700} className="text-lg font-semibold opacity-85">
          {photographerCount} of you shared them.
        </Rise>
      )}
    </SlideFrame>
  );
}

function TopPhotographerSlide({ top, runnersUp }: { top: PersonCount; runnersUp: PersonCount[] }) {
  const nameOf = useNameOf();

  return (
    <SlideFrame tone="gold">
      <Rise>
        <Kicker>Behind the lens</Kicker>
      </Rise>
      <span className="relative mt-4 block w-fit animate-pop motion-reduce:animate-none" style={{ animationDelay: "150ms" }}>
        <span className="block rounded-full ring-8 ring-white/40">
          <Avatar name={top.user.displayName} seed={top.user.id} src={top.user.avatarUrl} size="xl" />
        </span>
        <span aria-hidden className="absolute -top-7 left-1/2 -translate-x-1/2 -rotate-12 text-4xl">
          👑
        </span>
      </span>
      <h2 className="text-[clamp(1.75rem,11cqw,2.25rem)] leading-tight font-black tracking-tight text-balance wrap-break-word">
        <Rise delay={350}>{nameOf(top)} took the most photos.</Rise>
      </h2>
      <Rise delay={550} className="text-2xl font-bold">
        <AnimatedNumber value={top.count} delayMs={550} /> {nounFor(top.count, "photo")}
      </Rise>
      {runnersUp.length > 0 && (
        <Rise delay={1000} as="div">
          <ol className="flex flex-col gap-2" aria-label="Runners-up">
            {runnersUp.map((person, index) => (
              <li key={person.user.id} className="flex items-center gap-3 rounded-2xl bg-ink-950/10 px-3 py-2">
                <span className="w-4 text-sm font-black">{index + 2}</span>
                <Avatar name={person.user.displayName} seed={person.user.id} src={person.user.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate font-semibold">{nameOf(person)}</span>
                <span className="text-sm font-bold tabular-nums">
                  {formatNumber(person.count)} {nounFor(person.count, "photo")}
                </span>
              </li>
            ))}
          </ol>
        </Rise>
      )}
    </SlideFrame>
  );
}

type BusiestMonthProps = Extract<WrappedSlide, { type: "busiestMonth" }>;

function BusiestMonthSlide({ month, count, byMonth, busiestDay }: BusiestMonthProps) {
  const most = Math.max(...byMonth);

  return (
    <SlideFrame tone="ocean">
      <Rise>
        <Kicker>Month by month</Kicker>
      </Rise>
      <h2 className="text-[clamp(2rem,13cqw,3rem)] leading-none font-black tracking-tight text-balance">
        <Rise delay={150}>{monthName(month)} was your biggest month.</Rise>
      </h2>
      <div aria-hidden className="flex gap-1.5">
        {byMonth.map((photos, index) => {
          const isBusiest = index + 1 === month;
          return (
            <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-28 w-full items-end">
                <div
                  className={`w-full origin-bottom animate-grow-up rounded-t-md motion-reduce:animate-none ${
                    isBusiest ? "bg-white" : "bg-white/30"
                  }`}
                  style={{
                    height: photos === 0 ? "2px" : `${Math.max(6, (photos / most) * 100)}%`,
                    animationDelay: `${400 + index * 60}ms`,
                  }}
                />
              </div>
              <span className={`text-xs font-bold ${isBusiest ? "" : "opacity-60"}`}>{monthName(index + 1, monthNarrow)}</span>
            </div>
          );
        })}
      </div>
      <Rise delay={1200} className="text-2xl font-bold">
        <AnimatedNumber value={count} delayMs={1200} /> {nounFor(count, "photo")} in {monthName(month)}
      </Rise>
      {busiestDay && busiestDay.count > 1 && (
        <Rise delay={1700} className="text-lg opacity-85">
          Your busiest day was {dayLong.format(new Date(`${busiestDay.date}T00:00:00Z`))}, with{" "}
          {formatNumber(busiestDay.count)} photos.
        </Rise>
      )}
    </SlideFrame>
  );
}

const glow = (color: string) => (
  <div aria-hidden className={`absolute -top-24 left-1/2 size-96 -translate-x-1/2 rounded-full blur-3xl ${color}`} />
);

function MostReactedPhotoSlide({ photo, count }: { photo: Photo; count: number }) {
  const breakdown = REACTIONS.filter(({ type }) => photo.reactions.counts[type] > 0).sort(
    (a, b) => photo.reactions.counts[b.type] - photo.reactions.counts[a.type],
  );

  return (
    <SlideFrame tone="night" decoration={glow("bg-brand-rose/30")}>
      <Rise>
        <Kicker>Crowd favorite</Kicker>
      </Rise>
      <h2 className="-mt-2 text-3xl leading-tight font-black tracking-tight">
        <Rise delay={150}>Your most reacted-to photo</Rise>
      </h2>
      <span className="block animate-pop motion-reduce:animate-none" style={{ animationDelay: "350ms" }}>
        <span
          className="mx-auto block -rotate-2 rounded-2xl bg-white p-1.5 shadow-2xl shadow-brand-rose/30"
          // As wide as fits, but never taller than ~40% of the screen.
          style={{ width: `min(100%, calc(40dvh * ${photo.width / photo.height}))` }}
        >
          <PhotoImage
            photo={photo}
            variant="medium"
            priority
            className="rounded-xl"
            style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
          />
        </span>
      </span>
      <Rise delay={850} as="div">
        <span className="block text-3xl font-black">
          <AnimatedNumber value={count} delayMs={850} /> {nounFor(count, "reaction")}
        </span>
        {breakdown.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-3 text-lg font-semibold">
            {breakdown.map(({ type, emoji, label }) => (
              <span key={type} aria-label={`${label}: ${photo.reactions.counts[type]}`}>
                <span aria-hidden>
                  {emoji} {formatNumber(photo.reactions.counts[type])}
                </span>
              </span>
            ))}
          </span>
        )}
        <span className="mt-2 block text-sm wrap-anywhere opacity-70">
          by {photo.uploader.displayName} · {formatDayMonth(photo.createdAt)}
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
        <span
          key={index}
          className="absolute -bottom-10 animate-float-up text-4xl"
          style={{ left: `${left}%`, animationDelay: `${delay}s` }}
        >
          {REACTIONS[index % REACTIONS.length]!.emoji}
        </span>
      ))}
    </div>
  );
}

type ReactionsProps = Extract<WrappedSlide, { type: "reactions" }>;

function ReactionsSlide({ total, comments, topReactor }: ReactionsProps) {
  const nameOf = useNameOf();

  return (
    <SlideFrame tone="berry" decoration={<FloatingReactions />}>
      <h2 className="flex flex-col gap-2 font-black">
        <Rise className="text-3xl">You sent</Rise>
        <Rise delay={200} className={bigNumberClasses(total)}>
          <AnimatedNumber value={total} delayMs={200} />
        </Rise>
        <Rise delay={400} className="text-3xl">
          {nounFor(total, "reaction")}.
        </Rise>
      </h2>
      {comments > 0 && (
        <Rise delay={1600} className="text-xl font-bold">
          …and wrote <AnimatedNumber value={comments} delayMs={1600} durationMs={900} /> {nounFor(comments, "comment")}.
        </Rise>
      )}
      {topReactor && (
        <Rise delay={2200} as="div">
          <span className="flex items-center gap-3 rounded-2xl bg-ink-950/25 p-3 backdrop-blur">
            <Avatar
              name={topReactor.user.displayName}
              seed={topReactor.user.id}
              src={topReactor.user.avatarUrl}
              size="md"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{nameOf(topReactor)} reacted the most</span>
              <span className="block text-sm opacity-80">
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
    <SlideFrame tone="night" center decoration={glow("bg-brand-gold/20")}>
      <Rise>
        <Kicker>{year} in pictures</Kicker>
      </Rise>
      <h2 className="-mt-2 text-3xl font-black tracking-tight">
        <Rise delay={150}>Moments to remember</Rise>
      </h2>
      <ul className={`grid w-full gap-3 ${photos.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
        {photos.map((photo, index) => (
          <li key={photo.id} style={{ rotate: `${tilts[index % tilts.length]}deg` }}>
            <span
              className="block animate-pop rounded-xl bg-white p-1 shadow-xl shadow-black/40 motion-reduce:animate-none"
              style={{ animationDelay: `${350 + index * 140}ms` }}
            >
              <PhotoImage photo={photo} variant="thumbnail" priority className="aspect-square rounded-lg" />
            </span>
          </li>
        ))}
      </ul>
    </SlideFrame>
  );
}

type OutroProps = Extract<WrappedSlide, { type: "outro" }> & {
  wrapped: Wrapped;
  onRestart: () => void;
  onClose: () => void;
};

const outroButton =
  "inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition active:scale-[0.98]";

function OutroSlide({ photos, reactions, comments, people, wrapped, onRestart, onClose }: OutroProps) {
  const totals = [
    { value: photos, label: nounFor(photos, "photo") },
    { value: reactions, label: nounFor(reactions, "reaction") },
    { value: comments, label: nounFor(comments, "comment") },
    { value: people, label: nounFor(people, "friend") },
  ];

  return (
    <SlideFrame tone="sunset" center>
      <span aria-hidden className="block animate-pop text-7xl motion-reduce:animate-none">
        ❤️
      </span>
      <h2 className="text-4xl leading-tight font-black tracking-tight text-balance">
        <Rise delay={200}>That's your year together.</Rise>
      </h2>
      <Rise delay={500} as="div" className="w-full">
        <dl className="grid grid-cols-2 gap-3">
          {totals.map(({ value, label }) => (
            <div key={label} className="flex flex-col-reverse rounded-2xl bg-ink-950/10 px-4 py-3">
              <dt className="text-sm font-semibold">{label}</dt>
              <dd className="text-3xl font-black">
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
        <button type="button" onClick={onRestart} className={`${outroButton} bg-white/30 hover:bg-white/40`}>
          Watch again
        </button>
        <button type="button" onClick={onClose} className={`${outroButton} bg-ink-950 text-ink-50 hover:bg-ink-900`}>
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
      return <MostReactedPhotoSlide {...slide} />;
    case "reactions":
      return <ReactionsSlide {...slide} />;
    case "collage":
      return <CollageSlide photos={slide.photos} year={wrapped.year} />;
    case "outro":
      return <OutroSlide {...slide} wrapped={wrapped} onRestart={onRestart} onClose={onClose} />;
  }
}

/** Images the story will show, so they can load before their slide comes up. */
export function slideImageUrls(slide: WrappedSlide): string[] {
  if (slide.type === "mostReactedPhoto") return [slide.photo.imageUrls.medium];
  if (slide.type === "collage") return slide.photos.map((photo) => photo.imageUrls.thumbnail);
  return [];
}
