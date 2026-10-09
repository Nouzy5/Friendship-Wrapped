import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Avatar } from "../components/ui/Avatar";
import { Button, buttonClasses } from "../components/ui/Button";
import { CloseIcon } from "../components/ui/icons";
import { headerIconClasses } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { useCurrentUser } from "../features/auth/hooks";
import { useMoment } from "../features/moments/hooks";
import { CameraViewfinder } from "../features/camera/components/CameraViewfinder";
import { setCurrentGroupId, useCurrentGroup } from "../features/groups/current-group";
import { GroupPicker } from "../features/groups/components/GroupPicker";
import { useGroupMembers, useMyGroups } from "../features/groups/hooks";
import type { Group } from "../features/groups/types";
import { PhotoComposer } from "../features/photos/components/PhotoComposer";
import { isVideoFile, mediaFileError, videoLengthError } from "../lib/media-files";
import { usePageTitle } from "../lib/usePageTitle";

type Shot = { image?: Blob; video?: Blob; source: "camera" | "file" };

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The people who'll see what you post: everyone in the group but you. */
function Audience({ group }: { group: Group }) {
  const me = useCurrentUser();
  const members = useGroupMembers(group.id);
  const others = (members.data ?? []).filter((member) => member.user.id !== me.id);

  if (!members.data) return <p className="h-14" />;
  if (others.length === 0) return <p className="text-center text-sm text-sub">Only you are in {group.name} so far.</p>;

  const shown = others.slice(0, 6);
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div aria-hidden className="flex">
        {shown.map((member, index) => (
          <span key={member.user.id} className={`rounded-full ring-3 ring-bg ${index > 0 ? "-ml-2" : ""}`}>
            <Avatar name={member.user.displayName} src={member.user.avatarUrl} color={member.color} size="sm" />
          </span>
        ))}
      </div>
      <p className="px-6 text-center text-sm text-sub">
        {others.length <= 4
          ? `${listNames(others.map((member) => member.user.displayName.split(/\s+/)[0]!))} will see this`
          : `Everyone in ${group.name} will see this`}
      </p>
    </div>
  );
}

/** Full screen: the square camera, then a preview with a caption, posted to the group shown at the top. */
export function CameraPage() {
  const groups = useMyGroups();
  const current = useCurrentGroup();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requested = groups.data?.find((group) => group.id === searchParams.get("group"));
  const [chosen, setChosen] = useState<Group | null>(null);
  const group = chosen ?? requested ?? current ?? null;
  const [shot, setShot] = useState<Shot | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  usePageTitle(shot ? (shot.video ? "Share video" : "Share photo") : "Camera");

  // ?moment=…: the moment this photo is meant for. It only counts while it's open, in this group.
  const requestedMoment = useMoment(searchParams.get("moment"));
  const moment = requestedMoment.data && requestedMoment.data.isOpen && requestedMoment.data.groupId === group?.id ? requestedMoment.data : null;

  const closeTo = group ? `/groups/${group.id}` : "/home";

  async function pickFile(file: File) {
    const error = mediaFileError(file) ?? (isVideoFile(file) ? await videoLengthError(file) : null);
    setFileError(error);
    if (error) return;
    setShot(isVideoFile(file) ? { video: file, source: "file" } : { image: file, source: "file" });
  }

  let content;
  if (groups.isPending) {
    content = (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  } else if (groups.isLoadingError) {
    content = (
      <StateMessage
        emoji="📡"
        title="Couldn't load your groups"
        description="Check your connection and try again."
        action={<Button onClick={() => void groups.refetch()}>Try again</Button>}
      />
    );
  } else if (!group) {
    content = (
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
    );
  } else if (shot) {
    content = (
      <PhotoComposer
        image={shot.image}
        video={shot.video}
        group={group}
        discardLabel={shot.source === "camera" ? "Retake" : "Choose another"}
        moment={moment}
        onDiscard={() => setShot(null)}
        // Replace the camera in history, so "back" from the feed doesn't reopen it.
        onPosted={(photo) => void navigate(`/groups/${photo.groupId}`, { replace: true })}
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-8">
        {fileError && <Alert>{fileError}</Alert>}
        <CameraViewfinder
          onCapture={(image) => {
            setFileError(null);
            setShot({ image, source: "camera" });
          }}
          onPickFile={(file) => void pickFile(file)}
        />
        {moment && (
          <p className="text-center text-sm font-medium">
            <span aria-hidden>{moment.emoji ?? "✨"} </span>
            Posting into {moment.title}
          </p>
        )}
        <Audience group={group} />
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md animate-sheet-up flex-col gap-6 px-2 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <h1 className="sr-only">{shot ? (shot.video ? "Share video" : "Share photo") : "Camera"}</h1>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
        <Link to={closeTo} aria-label="Close camera" className={headerIconClasses}>
          <CloseIcon className="size-6" />
        </Link>
        <div className="flex justify-center">
          {group && (
            <GroupPicker
              variant="pill"
              align="center"
              context="Sharing with"
              current={group}
              onSelect={(next) => {
                setChosen(next);
                setCurrentGroupId(next.id);
              }}
            />
          )}
        </div>
      </div>
      {content}
    </main>
  );
}
