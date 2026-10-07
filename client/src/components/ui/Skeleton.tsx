import type { ReactNode } from "react";

/**
 * Placeholders shaped like the content that's loading, so the page doesn't jump when it
 * arrives. Hidden from screen readers, which hear the "Loading" status instead.
 */

const pulse = "animate-pulse bg-ink-800 motion-reduce:animate-none";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`${pulse} ${className}`} />;
}

function Loading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={className}>
      {children}
    </div>
  );
}

/** Like PhotoGrid: square thumbnails, three across. */
export function PhotoGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <Loading className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="aspect-square" />
      ))}
    </Loading>
  );
}

/** Like PhotoCard: who posted it, the photo, the reaction row. */
export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <Loading className="flex flex-col gap-8">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28 rounded-full" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
          </div>
          <Skeleton className="aspect-4/3 rounded-3xl" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }, (_, chip) => (
              <Skeleton key={chip} className="h-10 w-12 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** Rows of a picture and two lines of text: members, groups. */
export function ListSkeleton({ rows = 3, card = false }: { rows?: number; card?: boolean }) {
  return (
    <Loading className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={`flex items-center gap-4 ${card ? "rounded-3xl border border-ink-700/70 bg-ink-900/80 p-4" : ""}`}
        >
          <Skeleton className={card ? "size-12 rounded-2xl" : "size-10 rounded-full"} />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/2 rounded-full" />
            <Skeleton className="h-3 w-1/3 rounded-full" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** Like the albums tab: square covers two across, with a name and count under each. */
export function AlbumGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Loading className="grid grid-cols-2 gap-x-3 gap-y-5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="aspect-square rounded-2xl" />
          <Skeleton className="mx-1 h-3.5 w-2/3 rounded-full" />
          <Skeleton className="mx-1 h-3 w-1/3 rounded-full" />
        </div>
      ))}
    </Loading>
  );
}

/** Like On This Day: a line of text over a row of thumbnails. */
export function ThumbnailRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Loading className="flex flex-col gap-2">
      <Skeleton className="h-3.5 w-32 rounded-full" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} className="size-28 shrink-0 rounded-2xl" />
        ))}
      </div>
    </Loading>
  );
}
