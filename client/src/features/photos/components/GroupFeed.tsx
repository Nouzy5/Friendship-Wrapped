import { Link } from "react-router";
import { Button, buttonClasses } from "../../../components/ui/Button";
import { LoadMore } from "../../../components/ui/LoadMore";
import { FeedSkeleton, PhotoGridSkeleton } from "../../../components/ui/Skeleton";
import { StateMessage } from "../../../components/ui/StateMessage";
import type { Group } from "../../groups/types";
import { useGroupFeed } from "../hooks";
import { PhotoCard } from "./PhotoCard";
import { PhotoGrid } from "./PhotoGrid";

export type FeedLayout = "feed" | "grid";

/** The group's photos, newest first, loading more as you scroll. */
export function GroupFeed({ group, layout }: { group: Group; layout: FeedLayout }) {
  const feed = useGroupFeed(group.id);
  const cameraLink = `/camera?group=${encodeURIComponent(group.id)}`;

  if (feed.isPending) {
    return <div className="px-2">{layout === "grid" ? <PhotoGridSkeleton /> : <FeedSkeleton />}</div>;
  }

  if (feed.isLoadingError) {
    return (
      <StateMessage
        emoji="📡"
        title="Couldn't load photos"
        description="Check your connection and try again."
        action={<Button onClick={() => void feed.refetch()}>Try again</Button>}
      />
    );
  }

  if (feed.data.length === 0) {
    return (
      <StateMessage
        emoji="📸"
        title="No photos yet"
        description={`Be the first to post something to ${group.name}.`}
        action={
          <Link to={cameraLink} className={buttonClasses("accent")}>
            Take a photo
          </Link>
        }
      />
    );
  }

  return (
    <section aria-label="Photos" className="flex flex-col">
      {layout === "grid" ? (
        <div className="px-2">
          <PhotoGrid photos={feed.data} />
        </div>
      ) : (
        <ul className="flex flex-col gap-6">
          {feed.data.map((photo, index) => (
            // The first few arrive one after another; later pages just rise in.
            <li key={photo.id} className="animate-list-in" style={{ animationDelay: `${Math.min(index, 4) * 70}ms` }}>
              <PhotoCard photo={photo} groupName={group.name} priority={index === 0} />
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
        endMessage="You're all caught up."
      />
    </section>
  );
}
