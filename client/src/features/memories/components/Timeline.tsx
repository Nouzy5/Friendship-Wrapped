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
  onJump: (month: Month | null) => void;
};

/** The group's photos month by month, newest first, with a way to jump back to any month. */
export function Timeline({ group, from, onJump }: TimelineProps) {
  // From the latest photos, this shares the group feed's cache.
  const photos = useGroupFeed(group.id, from ? { before: endOfMonth(from) } : {});

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
      <StateMessage emoji="📸" title="No photos yet" description="Photos shared in the group show up here by month." />
    );
  } else {
    content = (
      <>
        {groupByMonth(photos.data, (photo) => photo.createdAt).map(({ month, items }) => (
          <section key={`${month.year}-${month.month}`} aria-label={formatMonthYear(monthStart(month))}>
            {/* Sticks under the app header while its month scrolls past. */}
            <h3 className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[5] -mx-4 bg-ink-950/90 px-4 py-2 font-semibold backdrop-blur">
              {formatMonthYear(monthStart(month))}
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
          endMessage="That's the very beginning ✨"
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Keyed so the pickers follow when the month changes from outside (e.g. "Back to the latest"). */}
      <MonthJump key={from ? formatMonthParam(from) : "latest"} group={group} from={from} onJump={onJump} />
      {from && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-400">
          Showing {formatMonthYear(monthStart(from))} and earlier
          <button type="button" onClick={() => onJump(null)} className="font-medium text-brand-orange hover:underline">
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

  const selectClasses =
    "h-10 rounded-full border border-ink-700 bg-ink-800/80 px-3 text-sm text-ink-50 outline-none focus:border-brand-orange";
  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2" aria-label="Jump to a month">
      <label htmlFor={`${id}-month`} className="text-sm text-ink-400">
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
      <Button type="submit" variant="secondary" className="min-h-10 px-4">
        Go
      </Button>
    </form>
  );
}
