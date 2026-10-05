import { Link } from "react-router";
import { Button, buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { CameraIcon } from "../../../components/ui/icons";
import { Spinner } from "../../../components/ui/Spinner";
import { StateMessage } from "../../../components/ui/StateMessage";
import { useGroupPhotos } from "../hooks";
import { PhotoGrid } from "./PhotoGrid";

/** The group's newest photos, with a shortcut to post one here. */
export function GroupPhotos({ groupId }: { groupId: string }) {
  const photos = useGroupPhotos(groupId);
  const cameraLink = `/camera?group=${encodeURIComponent(groupId)}`;

  let content;
  if (photos.isPending) {
    content = (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  } else if (photos.isError) {
    content = (
      <Card>
        <StateMessage
          emoji="📡"
          title="Couldn't load photos"
          description="Check your connection and try again."
          action={<Button onClick={() => void photos.refetch()}>Try again</Button>}
        />
      </Card>
    );
  } else if (photos.data.photos.length === 0) {
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
    content = <PhotoGrid photos={photos.data.photos} />;
  }

  return (
    <section aria-labelledby="group-photos-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="group-photos-heading" className="text-sm font-semibold tracking-wide text-ink-200 uppercase">
          Photos
        </h2>
        <Link to={cameraLink} className={buttonClasses("ghost", "min-h-9 px-3 text-xs")}>
          <CameraIcon className="size-4" />
          Add photo
        </Link>
      </div>
      {content}
    </section>
  );
}
