import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Button, buttonClasses } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { CameraViewfinder } from "../features/camera/components/CameraViewfinder";
import { useMyGroups } from "../features/groups/hooks";
import { PhotoComposer } from "../features/photos/components/PhotoComposer";
import { defaultShareGroupId } from "../features/photos/share-target";
import { imageFileError } from "../lib/image-files";

type Shot = { image: Blob; source: "camera" | "file" };

/** Camera → take photo → preview → caption → post (or pick one from the gallery). */
export function CameraPage() {
  const groups = useMyGroups();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedGroupId = searchParams.get("group");
  const [shot, setShot] = useState<Shot | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function pickFile(file: File) {
    const error = imageFileError(file);
    setFileError(error);
    if (!error) setShot({ image: file, source: "file" });
  }

  let content;
  if (groups.isPending) {
    content = (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  } else if (groups.isError) {
    content = (
      <Card>
        <StateMessage
          emoji="📡"
          title="Couldn't load your groups"
          description="Check your connection and try again."
          action={<Button onClick={() => void groups.refetch()}>Try again</Button>}
        />
      </Card>
    );
  } else if (groups.data.length === 0) {
    content = (
      <Card>
        <StateMessage
          emoji="🫶"
          title="Join a group first"
          description="Photos are shared with a group of friends. Create one, or open an invite link from a friend."
          action={
            <Link to="/groups/new" className={buttonClasses()}>
              Create a group
            </Link>
          }
        />
      </Card>
    );
  } else if (shot) {
    content = (
      <PhotoComposer
        image={shot.image}
        groups={groups.data}
        initialGroupId={defaultShareGroupId(groups.data, requestedGroupId)}
        discardLabel={shot.source === "camera" ? "Retake" : "Choose another"}
        onDiscard={() => setShot(null)}
        onPosted={(photo) => void navigate(`/groups/${photo.groupId}`)}
      />
    );
  } else {
    content = (
      <>
        {fileError && <Alert>{fileError}</Alert>}
        <CameraViewfinder onCapture={(image) => setShot({ image, source: "camera" })} onPickFile={pickFile} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <PageHeader
        title={shot ? "Share photo" : "Camera"}
        backTo={requestedGroupId ? `/groups/${encodeURIComponent(requestedGroupId)}` : undefined}
        backLabel="Back to group"
      />
      {content}
    </div>
  );
}
