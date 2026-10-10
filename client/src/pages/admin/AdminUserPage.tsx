import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Alert } from "../../components/ui/Alert";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ChevronLeftIcon, ChevronRightIcon } from "../../components/ui/icons";
import { Skeleton } from "../../components/ui/Skeleton";
import { StateMessage } from "../../components/ui/StateMessage";
import type { UserDetail } from "../../features/admin/api";
import { Facts, Section, StatCard } from "../../features/admin/components/AdminUi";
import { TypeToConfirmDialog } from "../../features/admin/components/TypeToConfirmDialog";
import {
  useAdminUser,
  useDeleteUser,
  useMarkEmailVerified,
  useResendVerification,
  useSignOutEverywhere,
} from "../../features/admin/hooks";
import { isNotFoundError } from "../../lib/api-client";
import { formatBytes, formatDateTime, formatRelativeTime, nounFor } from "../../lib/format";
import { getFormError } from "../../lib/form-errors";
import { toast } from "../../lib/toast";
import { usePageTitle } from "../../lib/usePageTitle";
import { useCurrentUser } from "../../features/auth/hooks";

function EmailFact({ detail }: { detail: UserDetail }) {
  const { user, verificationLink } = detail;
  if (!user.email) return <span className="text-sub">None: an account from before email was required</span>;

  return (
    <span className="flex flex-col gap-0.5">
      <span>{user.email}</span>
      <span className="text-sm text-sub">
        {user.emailVerified && user.emailVerifiedAt
          ? `Confirmed ${formatDateTime(user.emailVerifiedAt)}`
          : verificationLink
            ? `Not confirmed. Link sent ${formatRelativeTime(verificationLink.sentAt)}${new Date(verificationLink.expiresAt) < new Date() ? ", expired" : `, valid until ${formatDateTime(verificationLink.expiresAt)}`}.`
            : "Not confirmed, and no link is waiting"}
      </span>
    </span>
  );
}

function Actions({ detail }: { detail: UserDetail }) {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const { user } = detail;
  const verify = useMarkEmailVerified(user.id);
  const resend = useResendVerification(user.id);
  const signOut = useSignOutEverywhere(user.id);
  const remove = useDeleteUser();
  const [dialog, setDialog] = useState<"sign-out" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const error = getFormError(verify.error) ?? getFormError(resend.error);
  const canDelete = user.id !== me.id && !user.isAdmin;
  const pendingConfirmation = user.email !== null && !user.emailVerified;

  return (
    <Card className="flex flex-col gap-3 rounded-[1.25rem] p-4">
      <h2 className="text-base font-semibold">Actions</h2>
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {pendingConfirmation && (
        <>
          <Button
            variant="secondary"
            disabled={verify.isPending}
            onClick={() => verify.mutate(undefined, { onSuccess: () => setNotice(`${user.email} is now marked as confirmed.`) })}
          >
            {verify.isPending ? "Saving…" : "Mark email as confirmed"}
          </Button>
          <Button
            variant="secondary"
            disabled={resend.isPending}
            onClick={() => resend.mutate(undefined, { onSuccess: () => setNotice(`A new link was sent to ${user.email}.`) })}
          >
            {resend.isPending ? "Sending…" : "Send the confirmation email again"}
          </Button>
        </>
      )}
      <Button variant="secondary" disabled={signOut.isPending || detail.sessions.length === 0} onClick={() => setDialog("sign-out")}>
        Sign out of all devices
      </Button>
      <Button variant="danger" disabled={!canDelete} onClick={() => setDialog("delete")}>
        Delete account…
      </Button>
      {!canDelete && (
        <p className="text-[0.8125rem] text-sub">
          {user.id === me.id ? "You can't delete your own account here." : "An admin account can't be deleted from the admin panel."}
        </p>
      )}

      <ConfirmDialog
        open={dialog === "sign-out"}
        onClose={() => setDialog(null)}
        title={`Sign out @${user.username}?`}
        description={`They'll be signed out of ${detail.sessions.length} ${nounFor(detail.sessions.length, "device")} and need to log in again.`}
        confirmLabel="Sign out"
        pendingLabel="Signing out…"
        isPending={signOut.isPending}
        error={getFormError(signOut.error)}
        onConfirm={() =>
          signOut.mutate(undefined, {
            onSuccess: ({ signedOut }) => {
              setDialog(null);
              setNotice(`Signed out of ${signedOut} ${nounFor(signedOut, "session")}.`);
            },
          })
        }
      />

      <TypeToConfirmDialog
        open={dialog === "delete"}
        onClose={() => {
          remove.reset();
          setDialog(null);
        }}
        title={`Delete @${user.username}?`}
        description={
          <>
            This deletes the account and everything they posted: {detail.stats.photos + detail.stats.videos} posts, their comments and
            reactions. Groups they own pass to the longest-standing member. It can't be undone.
          </>
        }
        expected={user.username}
        confirmLabel="Delete account"
        pendingLabel="Deleting…"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={(typed) =>
          remove.mutate(
            { userId: user.id, confirm: typed },
            {
              onSuccess: () => {
                toast(`Deleted @${user.username}`);
                void navigate("/admin/users", { replace: true });
              },
            },
          )
        }
      />
    </Card>
  );
}

function Loaded({ detail }: { detail: UserDetail }) {
  const { user, stats } = detail;
  usePageTitle(`Admin · @${user.username}`);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link to="/admin/users" state={{ back: true }} className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-[0.9375rem] font-semibold text-sub hover:text-fg">
          <ChevronLeftIcon className="size-5" />
          Users
        </Link>
        <div className="flex items-center gap-4">
          <Avatar name={user.displayName} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[2rem] leading-tight font-semibold font-stretch-112% wrap-anywhere">{user.displayName}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sub">
              @{user.username}
              {user.isAdmin && <Badge>Admin</Badge>}
              {!user.email ? <Badge>No email</Badge> : !user.emailVerified && <Badge>Email not confirmed</Badge>}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <Card className="rounded-[1.25rem] p-4">
            <Facts
              items={[
                { label: "Email", value: <EmailFact detail={detail} /> },
                { label: "Joined", value: formatDateTime(user.createdAt) },
                {
                  label: "Last active",
                  value: detail.sessions[0] ? formatRelativeTime(detail.sessions[0].lastActiveAt) : "Not signed in anywhere now",
                },
                { label: "Account id", value: <code className="text-sm">{user.id}</code> },
              ]}
            />
          </Card>

          <Section title="What they've shared">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard label="Photos" value={stats.photos} />
              <StatCard label="Videos" value={stats.videos} />
              <StatCard label="Storage" value={formatBytes(stats.storageBytes)} />
              <StatCard label="Comments" value={stats.comments} />
              <StatCard label="Reactions given" value={stats.reactionsGiven} />
              <StatCard label="Favorites" value={stats.favorites} />
              <StatCard label="Albums made" value={stats.albumsCreated} />
              <StatCard label="Moments started" value={stats.momentsStarted} />
              <StatCard
                label="Reports"
                value={`${stats.reportsAgainst} against`}
                detail={`${stats.reportsMade} made · blocks: ${stats.peopleBlocked} given, ${stats.blockedBy} received`}
              />
            </div>
          </Section>

          <Section title={`Groups (${detail.groups.length})`}>
            {detail.groups.length === 0 ? (
              <p className="text-[0.9375rem] text-sub">Not in any group.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.groups.map((group) => (
                  <li key={group.id}>
                    <Link
                      to={`/admin/groups/${group.id}`}
                      className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 transition hover:bg-line/60"
                    >
                      <span aria-hidden className="text-2xl">
                        {group.emoji}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{group.name}</span>
                        <span className="text-sm text-sub">
                          {group.memberCount} {nounFor(group.memberCount, "member")} · joined {formatRelativeTime(group.joinedAt)}
                          {group.muted ? " · muted" : ""}
                        </span>
                      </span>
                      {group.role === "OWNER" && <Badge>Owner</Badge>}
                      <ChevronRightIcon className="size-5 shrink-0 text-sub" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Devices">
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="flex flex-col gap-2 rounded-[1.25rem] p-4">
                <h3 className="text-[0.9375rem] font-semibold">Signed in now ({detail.sessions.length})</h3>
                {detail.sessions.length === 0 && <p className="text-sm text-sub">Nowhere.</p>}
                <ul className="flex flex-col gap-2">
                  {detail.sessions.map((session) => (
                    <li key={session.id} className="flex flex-col text-[0.9375rem]">
                      <span>{session.device}</span>
                      <span className="text-sm text-sub">
                        last active {formatRelativeTime(session.lastActiveAt)} · since {formatDateTime(session.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="flex flex-col gap-2 rounded-[1.25rem] p-4">
                <h3 className="text-[0.9375rem] font-semibold">Devices seen ({detail.knownDevices.length})</h3>
                {detail.knownDevices.length === 0 && <p className="text-sm text-sub">None yet.</p>}
                <ul className="flex flex-col gap-2">
                  {detail.knownDevices.map((device, index) => (
                    <li key={`${device.firstSeenAt}-${index}`} className="flex flex-col text-[0.9375rem]">
                      <span>{device.label}</span>
                      <span className="text-sm text-sub">
                        first seen {formatDateTime(device.firstSeenAt)} · last {formatRelativeTime(device.lastSeenAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[0.8125rem] text-sub">A sign-in from a device not on this list sends them an email.</p>
              </Card>
            </div>
            <p className="text-[0.9375rem] text-sub">
              Notifications: {detail.notifications.webPushSubscriptions} {nounFor(detail.notifications.webPushSubscriptions, "browser")}, {detail.notifications.iphoneDevices}{" "}
              {nounFor(detail.notifications.iphoneDevices, "iPhone")}.
            </p>
          </Section>
        </div>

        <Actions detail={detail} />
      </div>
    </div>
  );
}

export function AdminUserPage() {
  const { userId = "" } = useParams();
  const detail = useAdminUser(userId);

  if (detail.isPending) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="h-16 w-2/3 rounded-2xl" />
        <Skeleton className="h-40 rounded-[1.25rem]" />
        <Skeleton className="h-40 rounded-[1.25rem]" />
      </div>
    );
  }

  if (detail.isError) {
    return isNotFoundError(detail.error) ? (
      <StateMessage
        emoji="🔍"
        title="No such user"
        description="They may have been deleted, or this id is wrong."
        action={
          <Link to="/admin/users" className="font-semibold underline">
            Back to users
          </Link>
        }
      />
    ) : (
      <Alert>Couldn't load this person: {getFormError(detail.error)}</Alert>
    );
  }

  return <Loaded detail={detail.data} />;
}
