import { useEffect, useEffectEvent, useRef } from "react";

/**
 * Calls `onVisible` when the element behind the returned ref comes within `margin` of
 * the viewport — e.g. to load the next page before the end of a list is reached.
 * Each time `enabled` turns back on it checks again, so it keeps going while the
 * element stays in view.
 */
export function useWhenVisible<T extends Element>(onVisible: () => void, enabled: boolean, margin = "800px") {
  const ref = useRef<T>(null);
  const handleVisible = useEffectEvent(onVisible);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) handleVisible();
      },
      { rootMargin: `${margin} 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, margin]);

  return ref;
}
