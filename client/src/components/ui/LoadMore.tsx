import type { ReactNode } from "react";
import { useWhenVisible } from "../../lib/useWhenVisible";
import { Button } from "./Button";
import { Spinner } from "./Spinner";

type LoadMoreProps = {
  hasMore: boolean;
  isLoading: boolean;
  isError: boolean;
  onLoadMore: () => void;
  /** e.g. "Load more photos". */
  label: string;
  /** Shown once everything has loaded. */
  endMessage?: ReactNode;
};

/**
 * Footer for a paginated list. The next page loads by itself as the footer scrolls
 * near, and the button does the same for keyboard users. After a failed page, it waits
 * for "Try again" instead of retrying in a loop.
 */
export function LoadMore({ hasMore, isLoading, isError, onLoadMore, label, endMessage }: LoadMoreProps) {
  const ref = useWhenVisible<HTMLDivElement>(onLoadMore, hasMore && !isLoading && !isError);

  // While "Try again" is loading the page, the last attempt's error is still reported.
  if (isError && !isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-ink-400">Couldn't load more. Check your connection.</p>
        <Button variant="secondary" onClick={onLoadMore}>
          Try again
        </Button>
      </div>
    );
  }

  if (!hasMore) {
    return endMessage ? <p className="py-6 text-center text-sm text-ink-400">{endMessage}</p> : null;
  }

  return (
    <div ref={ref} className="flex min-h-20 items-center justify-center">
      {isLoading ? (
        <Spinner />
      ) : (
        <Button variant="ghost" onClick={onLoadMore}>
          {label}
        </Button>
      )}
    </div>
  );
}
