import { Link, useParams } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { photoAlt } from "../features/photos/components/PhotoImage";
import { PhotoViewer } from "../features/photos/components/PhotoViewer";
import { usePhoto } from "../features/photos/hooks";
import { isNotFoundError } from "../lib/api-client";
import { usePageTitle } from "../lib/usePageTitle";

export function PhotoPage() {
  const { photoId = "" } = useParams();
  const photo = usePhoto(photoId);
  usePageTitle(photo.data ? photoAlt(photo.data) : "Photo");

  if (photo.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // A refetch that finds it gone (deleted by its uploader) counts too, even with the photo cached.
  if (photo.isLoadingError || (photo.isRefetchError && isNotFoundError(photo.error))) {
    return isNotFoundError(photo.error) ? (
      <StateMessage
        headingLevel="h1"
        emoji="🔍"
        title="Photo not found"
        description="It may have been deleted, or it's in a group you're not part of."
        action={
          <Link to="/home" className={buttonClasses()}>
            Go home
          </Link>
        }
      />
    ) : (
      <StateMessage
        headingLevel="h1"
        emoji="📡"
        title="Couldn't load this photo"
        description="Check your connection and try again."
        action={<Button onClick={() => void photo.refetch()}>Try again</Button>}
      />
    );
  }

  return <PhotoViewer photo={photo.data} />;
}
