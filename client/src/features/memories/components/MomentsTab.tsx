import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../../components/ui/Button";
import { PlusIcon } from "../../../components/ui/icons";
import { LoadMore } from "../../../components/ui/LoadMore";
import { AlbumGridSkeleton } from "../../../components/ui/Skeleton";
import { StateMessage } from "../../../components/ui/StateMessage";
import { useMoments, useStartMoment } from "../../moments/hooks";
import { MomentCard, momentPath } from "../../moments/components/MomentCard";
import { StartMomentDialog } from "../../moments/components/StartMomentDialog";

/** The group's moments, newest first, with a button to start one. */
export function MomentsTab({ groupId }: { groupId: string }) {
  const moments = useMoments(groupId);
  const start = useStartMoment(groupId);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const startButton = (
    <Button onClick={() => setStarting(true)}>
      <PlusIcon className="size-4" />
      Start a moment
    </Button>
  );

  let content;
  if (moments.isPending) {
    content = <AlbumGridSkeleton />;
  } else if (moments.isLoadingError) {
    content = (
      <StateMessage
        emoji="📡"
        title="Couldn't load moments"
        action={<Button onClick={() => void moments.refetch()}>Try again</Button>}
      />
    );
  } else if (moments.data.length === 0) {
    content = (
      <StateMessage
        emoji="✨"
        title="No moments yet"
        description="A moment is something you're doing right now: a night out, a hike, a barbecue. Everyone can post into it while it lasts."
        action={startButton}
      />
    );
  } else {
    content = (
      <>
        <div className="flex justify-end">{startButton}</div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5">
          {moments.data.map((moment) => (
            <li key={moment.id}>
              <MomentCard moment={moment} />
            </li>
          ))}
        </ul>
        <LoadMore
          hasMore={moments.hasNextPage}
          isLoading={moments.isFetchingNextPage}
          isError={moments.isFetchNextPageError}
          onLoadMore={() => void moments.fetchNextPage()}
          label="Load more moments"
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {content}
      <StartMomentDialog
        open={starting}
        onClose={() => {
          setStarting(false);
          start.reset();
        }}
        isPending={start.isPending}
        error={start.error}
        onSubmit={(input) => start.mutate(input, { onSuccess: (started) => void navigate(momentPath(started.id)) })}
      />
    </div>
  );
}
