import { Link } from "react-router";
import { Card } from "../../../components/ui/Card";
import { PhotoImage } from "../../photos/components/PhotoImage";
import { fromFeedState, photoPath } from "../../photos/viewer-link";
import { useOnThisDay } from "../hooks";
import { ThumbnailRowSkeleton } from "../../../components/ui/Skeleton";

const plural = new Intl.PluralRules("en");
const yearsAgo = (years: number) => `${years} ${plural.select(years) === "one" ? "year" : "years"} ago`;

/** Photos from today's date in earlier years, or a note that there's nothing yet. */
export function OnThisDay({ groupId }: { groupId: string }) {
  const memories = useOnThisDay(groupId);
  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long" });

  let content;
  if (memories.isPending) {
    content = <ThumbnailRowSkeleton />;
  } else if (memories.isLoadingError) {
    content = <p className="text-sm text-ink-400">Couldn't look back right now.</p>;
  } else if (memories.data.years.length === 0) {
    content = (
      <p className="text-sm text-ink-400">
        Nothing from {today} in earlier years yet. Keep capturing: next year, today shows up here.
      </p>
    );
  } else {
    const thisYear = Number(memories.data.date.slice(0, 4));
    content = (
      <div className="flex flex-col gap-4">
        {memories.data.years.map(({ year, photos }) => (
          <section key={year} aria-label={`${year}, ${yearsAgo(thisYear - year)}`}>
            <p className="mb-2 text-sm text-ink-200">
              <span className="font-semibold text-ink-50">{yearsAgo(thisYear - year)}</span> · {year}
            </p>
            <ul className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1">
              {photos.map((photo) => (
                <li key={photo.id} className="shrink-0 snap-start">
                  <Link to={photoPath(photo.id)} state={fromFeedState} className="block rounded-2xl">
                    <PhotoImage photo={photo} variant="thumbnail" className="size-28 rounded-2xl" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <Card aria-labelledby="on-this-day-heading" className="border-brand-orange/30">
      <h2 id="on-this-day-heading" className="mb-3 text-lg font-bold">
        On this day <span className="font-normal text-ink-400">· {today}</span>
      </h2>
      {content}
    </Card>
  );
}
