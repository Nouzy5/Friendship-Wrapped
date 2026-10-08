import { useId, useState, type FormEvent } from "react";
import { Button } from "../../../components/ui/Button";
import { LoadMore } from "../../../components/ui/LoadMore";
import { StateMessage } from "../../../components/ui/StateMessage";
import { formatMonthYear } from "../../../lib/format";
import type { Group } from "../../groups/types";
import { PhotoGrid } from "../../photos/components/PhotoGrid";
import { useGroupFeed } from "../../photos/hooks";
import { endOfMonth, formatMonthParam, groupByMonth, monthOf, type Month } from "../months";
import { PhotoGridSkeleton } from "../../../components/ui/Skeleton";

const monthStart = ({ year, month }: Month) => new Date(year, month - 1, 1).toISOString();
const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleDateString(undefined, { month: "long" }),
);

type TimelineProps = {
  group: Group;
  /** Start from this month (and go back in time), or null for the latest photos. */
  from: Month | null;
  /** Only this member's photos ("Taken by"), or null for everyone's. */
  uploaderId?: string | null;
  onJump: (month: Month | null) => void;
};

/** The group's photos month by month, newest first, with a way to jump back to any month. */
export function Timeline({ group, from, uploaderId = null, onJump }: TimelineProps) {
  // From the latest photos, for everyone, this shares the group feed's cache.
  const photos = useGroupFeed(group.id, { ...(from ? { before: endOfMonth(from) } : {}), ...(uploaderId ? { uploaderId } : {}) });

  let content;
  if (photos.isPending) {
    content = <PhotoGridSkeleton />;
  } else if (photos.isLoadingError) {
    content = (
      <StateMessage
        emoji="📡"
        title="Couldn't load photos"
        action={<Button onClick={() => void photos.refetch()}>Try again</Button>}
      />
    );
  } else if (photos.data.length === 0) {
    content = from ? (
      <StateMessage emoji="🕰️" title="Nothing that far back" description="This group had no photos yet by then." />
    ) : (
      <StateMessage emoji="📸" title="No photos yet" description={uploaderId ? "Nothing from them yet." : "Photos shared in the group show up here by month."} />
    );
  } else {
    content = (
      <>
        {groupByMonth(photos.data, (photo) => photo.createdAt).map(({ month, items }) => (
          <section key={`${month.year}-${month.month}`} aria-label={formatMonthYear(monthStart(month))}>
            {/* Sticks to the top while its month scrolls past. */}
            <h3 className="sticky top-[env(safe-area-inset-top)] z-[5] -mx-4 flex items-baseline gap-2 bg-bg px-4 pt-3 pb-2.5">
              <span className="text-[1.875rem] leading-none font-semibold font-stretch-112%">{monthNames[month.month - 1]}</span>
              <span className="text-[0.9375rem] text-sub">{month.year}</span>
            </h3>
            <PhotoGrid photos={items} />
          </section>
        ))}
        <LoadMore
          hasMore={photos.hasNextPage}
          isLoading={photos.isFetchingNextPage}
          isError={photos.isFetchNextPageError}
          onLoadMore={() => void photos.fetchNextPage()}
          label="Load earlier photos"
          endMessage="That's the very beginning."
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Keyed so the pickers follow when the month changes from outside (e.g. "Back to the latest"). */}
      <MonthJump key={from ? formatMonthParam(from) : "latest"} group={group} from={from} onJump={onJump} />
      {from && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-sub">
          Showing {formatMonthYear(monthStart(from))} and earlier
          <button type="button" onClick={() => onJump(null)} className="min-h-9 font-semibold text-fg underline underline-offset-2">
            Back to the latest
          </button>
        </p>
      )}
      {content}
    </div>
  );
}

/** Month and year pickers, from when the group began until now. */
function MonthJump({ group, from, onJump }: TimelineProps) {
  const now = monthOf(new Date().toISOString());
  const firstYear = monthOf(group.createdAt).year;
  const years = Array.from({ length: now.year - firstYear + 1 }, (_, index) => now.year - index);
  const [month, setMonth] = useState(from ?? now);
  const id = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isCurrentOrLater = month.year > now.year || (month.year === now.year && month.month >= now.month);
    onJump(isCurrentOrLater ? null : month);
  }

  const selectClasses = "h-11 rounded-full border-2 border-transparent bg-surface px-3 text-[0.9375rem] text-fg outline-none focus:border-fg";
  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2" aria-label="Jump to a month">
      <label htmlFor={`${id}-month`} className="text-[0.9375rem] text-sub">
        Jump to
      </label>
      <select
        id={`${id}-month`}
        value={month.month}
        onChange={(event) => setMonth({ ...month, month: Number(event.target.value) })}
        className={selectClasses}
      >
        {monthNames.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-year`} className="sr-only">
        Year
      </label>
      <select
        id={`${id}-year`}
        value={month.year}
        onChange={(event) => setMonth({ ...month, year: Number(event.target.value) })}
        className={selectClasses}
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary" className="min-h-11 px-4">
        Go
      </Button>
    </form>
  );
}
