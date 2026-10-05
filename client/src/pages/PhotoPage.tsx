import { Link, useParams } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { PhotoDetails } from "../features/photos/components/PhotoDetails";
import { usePhoto } from "../features/photos/hooks";
import { ApiError } from "../lib/api-client";

export function PhotoPage() {
  const { photoId = "" } = useParams();
  const photo = usePhoto(photoId);

  if (photo.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (photo.isError) {
    const notFound = photo.error instanceof ApiError && (photo.error.status === 404 || photo.error.status === 400);
    return notFound ? (
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

  return <PhotoDetails photo={photo.data} />;
}
