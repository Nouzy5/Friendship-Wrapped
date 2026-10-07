import { useEffect, useRef, type PointerEvent } from "react";

/** Pressing this long pauses the story instead of tapping. */
const HOLD_MS = 250;
/** A tap may wobble this much. */
const TAP_SLOP_PX = 12;
/** How far a swipe must travel, and how much more along its direction than across. */
const SWIPE_PX = 50;
const SWIPE_RATIO = 1.5;

type StoryGestureHandlers = {
  onTap: (side: "previous" | "next") => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeDown: () => void;
  onHoldChange: (holding: boolean) => void;
};

type Press = { pointerId: number; x: number; y: number; timer: number; held: boolean };

/**
 * Story controls for touch and mouse: tap the left third to go back and anywhere else to
 * go on, swipe sideways to move, swipe down to close, press and hold to pause. Buttons
 * and links inside keep their own clicks. Spread the result on the story with
 * `touch-action: none`.
 */
export function useStoryGestures({ onTap, onSwipeLeft, onSwipeRight, onSwipeDown, onHoldChange }: StoryGestureHandlers) {
  const press = useRef<Press | null>(null);

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  function release(): Press | null {
    const current = press.current;
    press.current = null;
    if (!current) return null;
    clearTimeout(current.timer);
    if (current.held) onHoldChange(false);
    return current;
  }

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      if ((event.target as Element).closest("button, a")) return;
      release();
      event.currentTarget.setPointerCapture(event.pointerId);
      const current: Press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: 0, held: false };
      current.timer = window.setTimeout(() => {
        current.held = true;
        onHoldChange(true);
      }, HOLD_MS);
      press.current = current;
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = press.current;
      if (!current || current.pointerId !== event.pointerId || current.held) return;
      // Moving means a swipe is starting, not a hold.
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > TAP_SLOP_PX) clearTimeout(current.timer);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (press.current?.pointerId !== event.pointerId) return;
      const current = release()!;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;

      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) >= Math.abs(dy) * SWIPE_RATIO) {
        (dx < 0 ? onSwipeLeft : onSwipeRight)();
      } else if (dy >= SWIPE_PX * 2 && dy >= Math.abs(dx) * SWIPE_RATIO) {
        onSwipeDown();
      } else if (!current.held && Math.abs(dx) <= TAP_SLOP_PX && Math.abs(dy) <= TAP_SLOP_PX) {
        const box = event.currentTarget.getBoundingClientRect();
        onTap(event.clientX - box.left < box.width / 3 ? "previous" : "next");
      }
    },
    onPointerCancel() {
      release();
    },
  };
}
