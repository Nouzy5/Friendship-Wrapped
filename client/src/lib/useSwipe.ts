import { useRef, type PointerEvent } from "react";

/** How far a finger must travel sideways, and how much more sideways than up/down. */
const MIN_DISTANCE_PX = 50;
const MIN_RATIO = 1.5;

type SwipeHandlers = { onSwipeLeft?: () => void; onSwipeRight?: () => void };

/**
 * Horizontal swipes on touch screens. Spread the result on the element and give it
 * `touch-action: pan-y pinch-zoom`, so vertical scrolling and zooming still work.
 */
export function useSwipe({ onSwipeLeft, onSwipeRight }: SwipeHandlers) {
  const start = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  return {
    onPointerDown(event: PointerEvent) {
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      start.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    },
    onPointerUp(event: PointerEvent) {
      const from = start.current;
      start.current = null;
      if (!from || from.pointerId !== event.pointerId) return;

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) < MIN_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * MIN_RATIO) return;
      (dx < 0 ? onSwipeLeft : onSwipeRight)?.();
    },
    // The browser took over (scrolling, zooming): not a swipe.
    onPointerCancel() {
      start.current = null;
    },
  };
}
