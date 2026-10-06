import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { CameraIcon, FeedIcon, GridIcon } from "../../../components/ui/icons";
import { LoadMore } from "../../../components/ui/LoadMore";
import { Spinner } from "../../../components/ui/Spinner";
import { StateMessage } from "../../../components/ui/StateMessage";
import { useGroupFeed } from "../hooks";
import { PhotoCard } from "./PhotoCard";
import { PhotoGrid } from "./PhotoGrid";

type Layout = "feed" | "grid";

const layouts: { value: Layout; label: string; icon: ReactNode }[] = [
  { value: "feed", label: "Feed", icon: <FeedIcon className="size-4" /> },
  { value: "grid", label: "Grid", icon: <GridIcon className="size-4" /> },
];

/** The layout lives in the URL (?view=grid), so it survives opening a photo and coming back. */
function useLayout(): [Layout, (layout: Layout) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const layout: Layout = searchParams.get("view") === "grid" ? "grid" : "feed";

  function setLayout(next: Layout) {
    setSearchParams(
      (params) => {
        if (next === "grid") params.set("view", "grid");
        else params.delete("view");
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  return [layout, setLayout];
}

/** The group's photos, newest first, loading more as you scroll. */
export function GroupFeed({ groupId }: { groupId: string }) {
  const feed = useGroupFeed(groupId);
  const [layout, setLayout] = useLayout();
  const cameraLink = `/camera?group=${encodeURIComponent(groupId)}`;

  let content;
  if (feed.isPending) {
    content = (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  } else if (feed.isError) {
    content = (
      <Card>
        <StateMessage
          emoji="📡"
          title="Couldn't load photos"
          description="Check your connection and try again."
          action={<Button onClick={() => void feed.refetch()}>Try again</Button>}
        />
      </Card>
    );
  } else if (feed.data.length === 0) {
    content = (
      <Card>
        <StateMessage
          emoji="📸"
          title="No photos yet"
          description="Be the first to share a moment with the group."
          action={
            <Link to={cameraLink} className={buttonClasses()}>
              Take a photo
            </Link>
          }
        />
      </Card>
    );
  } else {
    content = (
      <>
        {layout === "grid" ? (
          <PhotoGrid photos={feed.data} />
        ) : (
          <ul className="flex flex-col gap-8">
            {feed.data.map((photo, index) => (
              <li key={photo.id}>
                <PhotoCard photo={photo} priority={index === 0} />
              </li>
            ))}
          </ul>
        )}
        <LoadMore
          hasMore={feed.hasNextPage}
          isLoading={feed.isFetchingNextPage}
          isError={feed.isFetchNextPageError}
          onLoadMore={() => void feed.fetchNextPage()}
          label="Load more photos"
          endMessage="You're all caught up ✨"
        />
      </>
    );
  }

  return (
    <section aria-labelledby="group-photos-heading" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 id="group-photos-heading" className="flex-1 text-sm font-semibold tracking-wide text-ink-200 uppercase">
          Photos
        </h2>
        <div role="group" aria-label="Layout" className="flex rounded-full border border-ink-700 p-0.5">
          {layouts.map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              aria-pressed={layout === value}
              onClick={() => setLayout(value)}
              className={`grid size-8 place-items-center rounded-full transition ${
                layout === value ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-200"
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
        <Link to={cameraLink} className={buttonClasses("ghost", "min-h-9 px-3 text-xs")}>
          <CameraIcon className="size-4" />
          Add photo
        </Link>
      </div>
      {content}
    </section>
  );
}
