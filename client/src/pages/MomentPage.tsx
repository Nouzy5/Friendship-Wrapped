import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { CameraIcon, TrashIcon } from "../components/ui/icons";
import { LoadMore } from "../components/ui/LoadMore";
import { headerIconClasses, PageHeader } from "../components/ui/PageHeader";
import { PhotoGridSkeleton } from "../components/ui/Skeleton";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { momentCameraPath } from "../features/moments/components/OpenMomentStrip";
import { useDeleteMoment, useEndMoment, useMoment, useMomentPhotos } from "../features/moments/hooks";
import { describeMomentEnd } from "../features/moments/time-left";
import type { Moment } from "../features/moments/types";
import { PhotoGrid } from "../features/photos/components/PhotoGrid";
import { isNotFoundError } from "../lib/api-client";
import { getFormError } from "../lib/form-errors";
import { formatDateTime } from "../lib/format";
import { toast } from "../lib/toast";
import { usePageTitle } from "../lib/usePageTitle";

/** /memories/moments/:momentId */
export function MomentPage() {
  const { momentId = "" } = useParams();
  const moment = useMoment(momentId);
  usePageTitle(moment.data?.title ?? "Moment");

  if (moment.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  // A refetch that finds it gone (deleted meanwhile) counts too, even with the moment cached.
  if (moment.isLoadingError || (moment.isRefetchError && isNotFoundError(moment.error))) {
    return isNotFoundError(moment.error) ? (
      <StateMessage
        headingLevel="h1"
        emoji="🔍"
        title="Moment not found"
        description="It may have been deleted, or it's in a group you're not part of."
        action={
          <Link to="/memories?tab=moments" className={buttonClasses()}>
            Back to Memories
          </Link>
        }
      />
    ) : (
      <StateMessage
        headingLevel="h1"
        emoji="📡"
        title="Couldn't load this moment"
        action={<Button onClick={() => void moment.refetch()}>Try again</Button>}
      />
    );
  }
  return <MomentDetails moment={moment.data} />;
}

type OpenDialog = "end" | "delete" | null;

function MomentDetails({ moment }: { moment: Moment }) {
  const navigate = useNavigate();
  const photos = useMomentPhotos(moment.id);
  const end = useEndMoment(moment.id);
  const remove = useDeleteMoment(moment);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const backTo = `/memories?${new URLSearchParams({ group: moment.groupId, tab: "moments" })}`;

  function closeDialog() {
    setDialog(null);
    end.reset();
    remove.reset();
  }

  let content;
  if (photos.isPending) {
    content = <PhotoGridSkeleton />;
  } else if (photos.isLoadingError) {
    content = (
      <StateMessage
        emoji="📡"
        title="Couldn't load the photos"
        action={<Button onClick={() => void photos.refetch()}>Try again</Button>}
      />
    );
  } else if (photos.data.length === 0) {
    content = (
      <StateMessage
        emoji="📸"
        title="Nothing yet"
        description={moment.isOpen ? "Be the first to post into it." : "No photos were posted into this one."}
      />
    );
  } else {
    content = (
      <>
        <PhotoGrid photos={photos.data} />
        <LoadMore
          hasMore={photos.hasNextPage}
          isLoading={photos.isFetchingNextPage}
          isError={photos.isFetchNextPageError}
          onLoadMore={() => void photos.fetchNextPage()}
          label="Load more photos"
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-3">
      <PageHeader
        backTo={backTo}
        backLabel="Back to moments"
        action={
          moment.canManage && (
            <div className="-mr-2 flex items-center">
              <button type="button" aria-label="Delete moment" className={headerIconClasses} onClick={() => setDialog("delete")}>
                <TrashIcon className="size-5" />
              </button>
            </div>
          )
        }
      />

      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold font-stretch-112% tracking-tight break-words">
          {moment.emoji && <span aria-hidden>{moment.emoji} </span>}
          {moment.title}
        </h1>
        <p className="text-sm text-sub">
          {moment.photoCount === 1 ? "1 photo" : `${moment.photoCount} photos`}
          {moment.createdBy && ` · started by ${moment.createdBy.displayName}`}
          {` · ${formatDateTime(moment.startsAt)}`}
        </p>
        <p className="text-sm font-medium">{describeMomentEnd(moment.endsAt, moment.isOpen)}</p>
        {moment.isOpen && (
          <div className="flex flex-wrap gap-2">
            <Link to={momentCameraPath(moment.groupId, moment.id)} className={buttonClasses("accent")}>
              <CameraIcon className="size-5" />
              Add a photo
            </Link>
            {moment.canManage && (
              <Button variant="secondary" onClick={() => setDialog("end")}>
                End moment
              </Button>
            )}
          </div>
        )}
      </section>

      {content}

      <ConfirmDialog
        open={dialog === "end"}
        title="End this moment?"
        description="No more photos can be posted into it. The ones already there stay."
        confirmLabel="End moment"
        pendingLabel="Ending…"
        isPending={end.isPending}
        error={getFormError(end.error)}
        onConfirm={() => end.mutate(undefined, { onSuccess: closeDialog })}
        onClose={closeDialog}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this moment?"
        description="The moment goes for everyone in the group. Its photos stay in the group."
        confirmLabel="Delete moment"
        pendingLabel="Deleting…"
        variant="danger"
        isPending={remove.isPending}
        error={getFormError(remove.error)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast("Moment deleted");
              void navigate(backTo, { replace: true });
            },
          })
        }
        onClose={closeDialog}
      />
    </div>
  );
}
