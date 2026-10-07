import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PauseIcon, PlayIcon } from "../../../components/ui/icons";
import { usePageHidden } from "../../../lib/usePageHidden";
import type { Wrapped, WrappedSlideType } from "../types";
import { useStoryGestures } from "../useStoryGestures";
import { slideImageUrls, StorySlide } from "./StorySlide";

/** How long each slide stays up before the next, long enough to read it as it animates in. */
const SLIDE_MS: Record<WrappedSlideType, number> = {
  intro: 4500,
  photos: 5500,
  topPhotographer: 7000,
  busiestMonth: 7500,
  mostReactedPhoto: 7000,
  reactions: 7000,
  collage: 8000,
  outro: 6000,
};

type ProgressProps = { count: number; index: number; visit: number; durationMs: number; paused: boolean; onDone: () => void };

/** One bar per slide: the ones seen are full, the current one fills while it plays. */
function StoryProgress({ count, index, visit, durationMs, paused, onDone }: ProgressProps) {
  return (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: count }, (_, bar) => (
        <div key={bar} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
          {bar < index && <div className="size-full bg-white" />}
          {bar === index && (
            <div
              // A new key restarts the fill whenever the slide is (re)entered.
              key={visit}
              className="size-full origin-left animate-story-progress bg-white"
              style={{ animationDuration: `${durationMs}ms`, animationPlayState: paused ? "paused" : "running" }}
              onAnimationEnd={onDone}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const roundButton =
  "pointer-events-auto grid size-10 place-items-center rounded-full text-ink-50 transition hover:bg-white/15";
const sideButton =
  "hidden size-12 shrink-0 place-items-center rounded-full bg-ink-800 text-ink-50 transition hover:bg-ink-700 disabled:invisible sm:grid";

type WrappedStoryProps = { wrapped: Wrapped; onClose: () => void };

/**
 * The Wrapped as a full-screen story. Slides play on their own; tap the right of the
 * screen (or swipe left, or →) for the next, the left third (swipe right, ←) for the
 * previous; press and hold or Space pauses; swipe down or Escape closes. On a wide
 * screen it plays in a phone-shaped frame with arrows either side.
 */
export function WrappedStory({ wrapped, onClose }: WrappedStoryProps) {
  const { slides } = wrapped;
  const [position, setPosition] = useState({ index: 0, forward: true, visit: 0 });
  const [userPaused, setUserPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const hidden = usePageHidden();
  const rootRef = useRef<HTMLElement>(null);

  const index = Math.min(position.index, slides.length - 1);
  const slide = slides[index]!;
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;
  const paused = userPaused || holding || hidden;

  function goTo(target: number) {
    if (target < 0 || target >= slides.length) return;
    setPosition((current) => ({ index: target, forward: target >= current.index, visit: current.visit + 1 }));
  }
  const next = () => goTo(index + 1);
  const previous = () => goTo(index - 1);
  const restart = () => {
    setUserPaused(false);
    goTo(0);
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gap-6 bg-black sm:bg-ink-950 sm:p-4">
      <button type="button" onClick={previous} disabled={isFirst} aria-label="Previous slide" className={sideButton}>
        <ChevronLeftIcon className="size-6" />
      </button>

      <section
        ref={rootRef}
        tabIndex={-1}
        aria-roledescription="story"
        aria-label={`${wrapped.group.name}: ${wrapped.year} Wrapped`}
        className="relative size-full touch-none overflow-hidden outline-none select-none [-webkit-touch-callout:none] sm:aspect-9/16 sm:h-[min(100%,52rem)] sm:w-auto sm:rounded-3xl sm:shadow-2xl sm:shadow-black/60"
        onContextMenu={(event) => event.preventDefault()}
        {...gestures}
      >
        {/* Announced as it changes only while paused: a playing story would talk over itself. */}
        <div aria-live={userPaused ? "polite" : "off"} className="absolute inset-0">
          <div
            key={position.visit}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
            className={`absolute inset-0 motion-reduce:animate-none ${
              position.forward ? "animate-enter-forward" : "animate-enter-back"
            }`}
          >
            <StorySlide slide={slide} wrapped={wrapped} onRestart={restart} onClose={onClose} />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b from-black/40 to-transparent px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-8">
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
          <div className="mt-2 flex items-center gap-2 text-ink-50 [text-shadow:0_1px_4px_rgb(0_0_0/0.4)]">
            <span aria-hidden className="text-lg">
              {wrapped.group.emoji}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {wrapped.group.name} · {wrapped.year}
            </span>
            <button
              type="button"
              onClick={() => setUserPaused((value) => !value)}
              aria-label={userPaused ? "Play" : "Pause"}
              className={roundButton}
            >
              {userPaused ? <PlayIcon className="size-5" /> : <PauseIcon className="size-5" />}
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className={`-mr-1 ${roundButton}`}>
              <CloseIcon className="size-6" />
            </button>
          </div>
        </div>
      </section>

      <button type="button" onClick={next} disabled={isLast} aria-label="Next slide" className={sideButton}>
        <ChevronRightIcon className="size-6" />
      </button>
    </div>
  );
}
