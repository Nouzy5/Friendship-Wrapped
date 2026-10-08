import { useLayoutEffect, useRef, useState } from "react";

/**
 * A caption cut to three lines, with "more" to read the rest. "more" sits over the end
 * of the last line instead of below it, so measuring the caption never shifts the page
 * (which would throw off the restored scroll position when coming back to the feed).
 */
export function PhotoCaption({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && !expanded) setOverflowing(element.scrollHeight > element.clientHeight);
  }, [text, expanded]);

  return (
    <div className="relative text-sm text-ink-50">
      <p ref={ref} dir="auto" className={`break-words whitespace-pre-line ${expanded ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {overflowing && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute right-0 bottom-0 bg-linear-to-r from-transparent to-ink-950 to-40% pl-10 font-medium text-ink-400 hover:text-ink-200"
        >
          more
        </button>
      )}
    </div>
  );
}
