import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button, buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { CameraIcon } from "../../../components/ui/icons";
import type { Group } from "../../groups/types";
import { useOpenMoment, useStartMoment } from "../hooks";
import { describeMomentEnd } from "../time-left";
import { momentPath } from "./MomentCard";
import { StartMomentDialog } from "./StartMomentDialog";

/** The camera, with the moment chosen to post into. */
export const momentCameraPath = (groupId: string, momentId: string) =>
  `/camera?${new URLSearchParams({ group: groupId, moment: momentId })}`;

/**
 * Above the feed: the moment happening now, with a way to post into it, or a way to start
 * one. Nothing at all while the answer is loading, so the feed doesn't jump for a moment that isn't there.
 */
export function OpenMomentStrip({ group }: { group: Group }) {
  const open = useOpenMoment(group.id);
  const start = useStartMoment(group.id);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  if (open.isPending || open.isError) return null;
  const moment = open.data;

  return (
    <div className="px-4 pb-4">
      {moment ? (
        <Card aria-label="A moment is happening now">
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-3xl leading-none">
              {moment.emoji ?? "✨"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide text-sub uppercase">Happening now</p>
              <h2 className="text-lg leading-tight font-semibold font-stretch-112% break-words">{moment.title}</h2>
              <p className="mt-0.5 text-sm text-sub">
                {moment.photoCount === 1 ? "1 photo" : `${moment.photoCount} photos`} · {describeMomentEnd(moment.endsAt, true)}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link to={momentCameraPath(group.id, moment.id)} className={buttonClasses("accent", "flex-1")}>
              <CameraIcon className="size-5" />
              Add a photo
            </Link>
            <Link to={momentPath(moment.id)} className={buttonClasses("secondary", "flex-1")}>
              See all
            </Link>
          </div>
        </Card>
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => setStarting(true)}>
          <span aria-hidden>✨</span> Start a moment
        </Button>
      )}

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
