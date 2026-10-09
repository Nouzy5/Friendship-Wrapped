import { useId, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { getFormError } from "../../../lib/form-errors";
import { formatDayMonth } from "../../../lib/format";
import type { Group } from "../../groups/types";
import { DEFAULT_INVITE_LIFETIME_DAYS, INVITE_LIFETIMES, type InviteLifetimeDays } from "../api";
import { useCreateInvite } from "../hooks";
import { canUseNativeShare, copyToClipboard, inviteUrl, shareInviteLink } from "../invite-link";
import { QrCode } from "./QrCode";

type CopyState = "idle" | "copied" | "failed";

const lifetimeOptions = INVITE_LIFETIMES.map(({ days, label }) => ({ value: String(days), label }));

export function InviteFriendsCard({ group, highlight = false }: { group: Group; highlight?: boolean }) {
  const createInvite = useCreateInvite(group.id);
  const [lifetimeDays, setLifetimeDays] = useState<InviteLifetimeDays>(DEFAULT_INVITE_LIFETIME_DAYS);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [showQr, setShowQr] = useState(false);
  const headingId = useId();
  const inputId = useId();

  const invite = createInvite.data;
  const url = invite ? inviteUrl(invite.token) : null;

  async function handleCopy() {
    if (!url) return;
    setCopyState((await copyToClipboard(url)) ? "copied" : "failed");
  }

  /** Back to choosing how long the next link lasts. The old link keeps working until it expires. */
  function makeAnother() {
    createInvite.reset();
    setCopyState("idle");
    setShowQr(false);
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
          <Button
            variant="secondary"
            aria-expanded={showQr}
            onClick={() => setShowQr((open) => !open)}
          >
            {showQr ? "Hide QR code" : "Show QR code"}
          </Button>
          {showQr && (
            <div className="flex animate-page-fade flex-col items-center gap-2 py-1">
              <QrCode value={url} label={`QR code for the invite link to ${group.name}`} />
              <p className="text-center text-[0.8125rem] text-sub">Friends can scan this with their phone's camera.</p>
            </div>
          )}
          <p role="status" className="text-[0.8125rem] text-sub">
            {copyState === "failed"
              ? "Couldn't copy automatically. Select the link above and copy it."
              : `Link works until ${formatDayMonth(invite.expiresAt)}.`}
          </p>
          <Button variant="ghost" className="self-start" onClick={makeAnother}>
            Make another link
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <span aria-hidden className="text-[0.8125rem] font-medium text-sub">
              Link works for
            </span>
            <SegmentedControl
              label="How long the link works"
              options={lifetimeOptions}
              value={String(lifetimeDays)}
              onChange={(value) => setLifetimeDays(Number(value) as InviteLifetimeDays)}
            />
          </div>
          <Button className="w-full" onClick={() => createInvite.mutate(lifetimeDays)} disabled={createInvite.isPending}>
            {createInvite.isPending ? "Creating link…" : "Create invite link"}
          </Button>
        </div>
      )}
    </Card>
  );
}
