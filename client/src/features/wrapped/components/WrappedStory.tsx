import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PauseIcon, PlayIcon, ShareIcon } from "../../../components/ui/icons";
import { toast } from "../../../lib/toast";
import { usePageHidden } from "../../../lib/usePageHidden";
import { useCurrentUser } from "../../auth/hooks";
import { GroupAvatar } from "../../groups/components/GroupAvatar";
import { useGroupPeople } from "../../groups/hooks";
import { planShareCard } from "../share/card-plan";
import { renderCard } from "../share/card-render";
import { shareCard } from "../share/share-card";
import type { Wrapped, WrappedSlideType } from "../types";
import { useStoryGestures } from "../useStoryGestures";
import { slideImageUrls, slideTone, StorySlide } from "./StorySlide";

/** How long each slide stays up before the next, long enough to read it as it animates in. */
const SLIDE_MS: Record<WrappedSlideType, number> = {
  intro: 4500,
  photos: 5500,
  topPhotographer: 7000,
  busiestMonth: 7500,
  mostReactedPhoto: 7000,
  reactions: 7000,
  collage: 8000,
  you: 8000,
  outro: 6000,
};

/** The outgoing slide stays this long, fading out under the incoming one (the `exit` animation). */
const CROSSFADE_MS = 450;

type ProgressProps = { count: number; index: number; visit: number; durationMs: number; paused: boolean; onDone: () => void };

/** One bar per slide: the ones seen are full, the current one fills while it plays. In the slide's ink colour. */
function StoryProgress({ count, index, visit, durationMs, paused, onDone }: ProgressProps) {
  return (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: count }, (_, bar) => (
        <div key={bar} className="h-1 flex-1 overflow-hidden rounded-full bg-current/25">
          {bar < index && <div className="size-full bg-current" />}
          {bar === index && (
            <div
              // A new key restarts the fill whenever the slide is (re)entered.
              key={visit}
              className="size-full origin-left animate-story-progress bg-current"
              style={{ animationDuration: `${durationMs}ms`, animationPlayState: paused ? "paused" : "running" }}
              onAnimationEnd={onDone}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const roundButton = "pointer-events-auto grid size-11 place-items-center rounded-full transition hover:bg-current/15";
const sideButton =
  "hidden size-12 shrink-0 place-items-center rounded-full bg-surface text-fg transition hover:bg-line disabled:invisible sm:grid";
/** On phones, previous/next are taps and swipes; these buttons are for screen readers (and show when focused). */
const hiddenStepButton =
  "sr-only rounded-full bg-inverse px-4 py-2 text-sm font-semibold text-on-inverse focus:not-sr-only focus:absolute focus:bottom-4 focus:z-10 sm:hidden";

type WrappedStoryProps = { wrapped: Wrapped; onClose: () => void };

type Layer = { index: number; visit: number };

/**
 * The Wrapped as a full-screen story. Slides play on their own; tap the right of the
 * screen (or swipe left, or →) for the next, the left third (swipe right, ←) for the
 * previous; press and hold or Space pauses; swipe down or Escape closes. On a wide
 * screen it plays in a phone-shaped frame with arrows either side.
 */
export function WrappedStory({ wrapped, onClose }: WrappedStoryProps) {
  const { slides } = wrapped;
  const [position, setPosition] = useState({ index: 0, forward: true, visit: 0 });
  const [leaving, setLeaving] = useState<Layer | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const hidden = usePageHidden();
  const rootRef = useRef<HTMLElement>(null);
  const me = useCurrentUser();
  const { colorOf } = useGroupPeople(wrapped.group.id);

  const index = Math.min(position.index, slides.length - 1);
  const slide = slides[index]!;
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;
  const paused = userPaused || holding || hidden;
  const tone = slideTone(slide, colorOf, me.id);
  const card = planShareCard(slide, { wrapped, me, colorOf });

  /** Draws this slide as a card on this device and opens the share sheet with it. */
  async function share() {
    if (!card || sharing) return;
    setSharing(true);
    setUserPaused(true);
    try {
      const image = await renderCard(card);
      if ((await shareCard(image, card.filename, card.title)) === "saved") toast("Card saved to your downloads");
    } catch {
      toast("Couldn't make that card. Try again.", "error");
    } finally {
      setSharing(false);
    }
  }

  function goTo(target: number) {
    if (target < 0 || target >= slides.length || target === index) return;
    setLeaving({ index, visit: position.visit });
    setPosition({ index: target, forward: target > index, visit: position.visit + 1 });
  }
  const next = () => goTo(index + 1);
  const previous = () => goTo(index - 1);
  const restart = () => {
    setUserPaused(false);
    goTo(0);
  };

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), CROSSFADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const gestures = useStoryGestures({
    onTap: (side) => (side === "previous" ? previous() : next()),
    onSwipeLeft: next,
    onSwipeRight: previous,
    onSwipeDown: onClose,
    onHoldChange: setHolding,
  });

  // Keyboard and screen reader users start inside the story.
  useEffect(() => rootRef.current?.focus(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      // Space and Enter on a focused button press that button.
      const onButton = (event.target as Element).closest?.("button, a");
      if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") previous();
      else if (event.key === "Escape") onClose();
      else if (event.key === " " && !onButton) setUserPaused((value) => !value);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Fetch the photos for later slides now, so they're there when their slide comes up.
  useEffect(() => {
    for (const url of slides.flatMap(slideImageUrls)) new Image().src = url;
  }, [slides]);

  // The outgoing slide (if any) underneath, then the current one. Keys are visits, so a
  // slide that starts leaving stays mounted as it was and only its animation changes.
  const layers: Layer[] = [...(leaving ? [leaving] : []), { index, visit: position.visit }];
  const label = `${wrapped.group.name}: ${wrapped.year} Wrapped`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gap-6 bg-bg sm:p-4">
      <button type="button" onClick={previous} disabled={isFirst} aria-label="Previous slide" className={sideButton}>
        <ChevronLeftIcon className="size-6" />
      </button>

      <section
        ref={rootRef}
        tabIndex={-1}
        aria-roledescription="story"
        aria-label={label}
        className={`@container relative size-full touch-none overflow-hidden outline-none select-none [-webkit-touch-callout:none] sm:aspect-9/16 sm:h-[min(100%,52rem)] sm:w-auto sm:rounded-[2rem] sm:shadow-[0_0_0_1px_var(--line)] ${
          // Pausing also freezes the looping decorations (entrances still play, or a slide
          // you step to while paused would stay invisible).
          paused ? "[&_.animate-float-up]:[animation-play-state:paused] [&_.animate-pan]:[animation-play-state:paused]" : ""
        }`}
        onContextMenu={(event) => event.preventDefault()}
        {...gestures}
      >
        <h1 className="sr-only">{label}</h1>

        {/* Announced as it changes only while paused: a playing story would talk over itself. */}
        <div aria-live={userPaused ? "polite" : "off"} className="absolute inset-0">
          {layers.map((layer) => {
            const current = layer.visit === position.visit;
            return (
              <div
                key={layer.visit}
                role={current ? "group" : undefined}
                aria-roledescription={current ? "slide" : undefined}
                aria-label={current ? `${index + 1} of ${slides.length}` : undefined}
                aria-hidden={current ? undefined : true}
                className={`absolute inset-0 motion-reduce:animate-none ${
                  current
                    ? position.forward
                      ? "animate-enter-forward"
                      : "animate-enter-back"
                    : "pointer-events-none animate-exit motion-reduce:hidden"
                }`}
              >
                <StorySlide slide={slides[layer.index]!} wrapped={wrapped} onRestart={restart} onClose={onClose} />
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-4 transition-colors duration-300" style={{ color: tone.ink }}>
          <StoryProgress
            count={slides.length}
            index={index}
            visit={position.visit}
            durationMs={SLIDE_MS[slide.type]}
            paused={paused}
            onDone={() => {
              if (!isLast) next();
            }}
          />
          <div className="mt-2 flex items-center gap-2">
            <GroupAvatar group={wrapped.group} size={28} />
            <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
              <span className="font-semibold">{wrapped.group.name}</span> {wrapped.year}
            </span>
            {card && (
              <button type="button" onClick={() => void share()} disabled={sharing} aria-label="Share this slide as an image" className={`${roundButton} disabled:opacity-40`}>
                <ShareIcon className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setUserPaused((value) => !value)}
              aria-label={userPaused ? "Play" : "Pause"}
              className={roundButton}
            >
              {userPaused ? <PlayIcon className="size-5" /> : <PauseIcon className="size-5" />}
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className={`-mr-1.5 ${roundButton}`}>
              <CloseIcon className="size-6" />
            </button>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex justify-between px-4">
          <button type="button" onClick={previous} disabled={isFirst} className={`${hiddenStepButton} focus:left-4`}>
            Previous slide
          </button>
          <button type="button" onClick={next} disabled={isLast} className={`${hiddenStepButton} focus:right-4`}>
            Next slide
          </button>
        </div>
      </section>

      <button type="button" onClick={next} disabled={isLast} aria-label="Next slide" className={sideButton}>
        <ChevronRightIcon className="size-6" />
      </button>
    </div>
  );
}
