import { Button } from "../../../components/ui/Button";
import { LoadMore } from "../../../components/ui/LoadMore";
import { StateMessage } from "../../../components/ui/StateMessage";
import { PhotoGrid } from "../../photos/components/PhotoGrid";
import { useGroupFeed } from "../../photos/hooks";
import { PhotoGridSkeleton } from "../../../components/ui/Skeleton";

/** The photos you've starred in this group, newest first. Only you see them. */
export function FavoritesTab({ groupId }: { groupId: string }) {
  const favorites = useGroupFeed(groupId, { favorites: true });

  if (favorites.isPending) return <PhotoGridSkeleton />;
  if (favorites.isLoadingError) {
    return (
      <StateMessage
        emoji="📡"
        title="Couldn't load favorites"
        action={<Button onClick={() => void favorites.refetch()}>Try again</Button>}
      />
    );
  }
  if (favorites.data.length === 0) {
    return (
      <StateMessage
        emoji="⭐"
        title="No favorites yet"
        description="Tap the star on a photo to keep it here. Only you can see your favorites."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-sub">Only you can see your favorites.</p>
      <PhotoGrid photos={favorites.data} />
      <LoadMore
        hasMore={favorites.hasNextPage}
        isLoading={favorites.isFetchingNextPage}
        isError={favorites.isFetchNextPageError}
        onLoadMore={() => void favorites.fetchNextPage()}
        label="Load more favorites"
      />
    </div>
  );
}
