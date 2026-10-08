import { useId, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { getFormError } from "../../../lib/form-errors";
import { formatDayMonth } from "../../../lib/format";
import type { Group } from "../../groups/types";
import { useCreateInvite } from "../hooks";
import { canUseNativeShare, copyToClipboard, inviteUrl, shareInviteLink } from "../invite-link";

type CopyState = "idle" | "copied" | "failed";

export function InviteFriendsCard({ group, highlight = false }: { group: Group; highlight?: boolean }) {
  const createInvite = useCreateInvite(group.id);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const headingId = useId();
  const inputId = useId();

  const invite = createInvite.data;
  const url = invite ? inviteUrl(invite.token) : null;

  async function handleCopy() {
    if (!url) return;
    setCopyState((await copyToClipboard(url)) ? "copied" : "failed");
  }

  return (
    <Card aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xl font-semibold font-stretch-112%">
        {highlight ? "It's just you so far" : "Invite friends"}
      </h2>
      <p className="mt-1 text-[0.9375rem] text-sub">
        {highlight
          ? "Send your friends an invite link so they can join the group."
          : "Anyone with an invite link can join this group."}
      </p>

      {createInvite.isError && (
        <div className="mt-4">
          <Alert>{getFormError(createInvite.error)}</Alert>
        </div>
      )}

      {url && invite ? (
        <div className="mt-4 flex flex-col gap-3">
          <label className="sr-only" htmlFor={inputId}>
            Invite link
          </label>
          <input
            id={inputId}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 w-full rounded-2xl bg-bg px-4 text-[0.9375rem] text-sub"
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void handleCopy()}>
              {copyState === "copied" ? "Copied!" : "Copy link"}
            </Button>
            {canUseNativeShare() && (
              <Button variant="secondary" className="flex-1" onClick={() => void shareInviteLink(url, group.name)}>
                Share…
              </Button>
            )}
          </div>
          <p role="status" className="text-[0.8125rem] text-sub">
            {copyState === "failed"
              ? "Couldn't copy automatically. Select the link above and copy it."
              : `Link works until ${formatDayMonth(invite.expiresAt)}. Make a new one any time.`}
          </p>
        </div>
      ) : (
        <Button className="mt-4 w-full" onClick={() => createInvite.mutate()} disabled={createInvite.isPending}>
          {createInvite.isPending ? "Creating link…" : "Create invite link"}
        </Button>
      )}
    </Card>
  );
}
