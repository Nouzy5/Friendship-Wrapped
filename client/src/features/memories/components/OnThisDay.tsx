import { Link } from "react-router";
import { ThumbnailRowSkeleton } from "../../../components/ui/Skeleton";
import { useGroupPeople } from "../../groups/hooks";
import { NameTag } from "../../photos/components/NameTag";
import { photoAlt, PhotoImage } from "../../photos/components/PhotoImage";
import { fromFeedState, photoPath } from "../../photos/viewer-link";
import { useOnThisDay } from "../hooks";

const plural = new Intl.PluralRules("en");
const yearsAgo = (years: number) => `${years} ${plural.select(years) === "one" ? "year" : "years"} ago`;

/** Photos from today's date in earlier years, each tagged with who took it, or a note that there's nothing yet. */
export function OnThisDay({ groupId }: { groupId: string }) {
  const memories = useOnThisDay(groupId);
  const { colorOf } = useGroupPeople(groupId);
  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long" });

  let content;
  if (memories.isPending) {
    content = <ThumbnailRowSkeleton />;
  } else if (memories.isLoadingError) {
    content = <p className="text-sm text-sub">Couldn't look back right now.</p>;
  } else if (memories.data.years.length === 0) {
    content = <p className="text-[0.9375rem] text-sub">Nothing from {today} in earlier years yet. Next year, today shows up here.</p>;
  } else {
    const thisYear = Number(memories.data.date.slice(0, 4));
    const photos = memories.data.years.flatMap(({ year, photos: inYear }) => inYear.map((photo) => ({ photo, ago: yearsAgo(thisYear - year) })));
    content = (
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {photos.map(({ photo, ago }, index) => (
          <li key={photo.id} className="shrink-0 animate-list-in snap-start" style={{ animationDelay: `${index * 60}ms` }}>
            <Link to={photoPath(photo.id)} state={fromFeedState} aria-label={`${photoAlt(photo)}, ${ago}`} className="flex flex-col gap-1.5 rounded-[1.375rem]">
              <span className="relative block">
                <PhotoImage photo={photo} variant="thumbnail" className="size-31 rounded-[1.375rem]" />
                <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)]">
                  <NameTag name={photo.uploader.displayName.split(/\s+/)[0]!} color={colorOf(photo.uploader.id)} small />
                </span>
              </span>
              <span className="text-[0.8125rem]">{ago}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="on-this-day-heading" className="flex flex-col gap-3">
      <h2 id="on-this-day-heading" className="flex items-baseline gap-2">
        <span className="text-lg font-semibold">On this day</span>
        <span className="text-sm text-sub">{today}</span>
      </h2>
      {content}
    </section>
  );
}
