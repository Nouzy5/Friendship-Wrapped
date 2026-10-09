import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Button, buttonClasses } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { useSession } from "../features/auth/hooks";
import { GroupAvatar } from "../features/groups/components/GroupAvatar";
import { expiredInviteFrom } from "../features/invites/api";
import { useAcceptInvite, useInvitePreview } from "../features/invites/hooks";
import { ApiError } from "../lib/api-client";
import { getFormError } from "../lib/form-errors";
import { formatMemberCount } from "../lib/format";
import { usePageTitle } from "../lib/usePageTitle";

/** Public landing page for an invite link: preview the group, then sign up / log in / join. */
export function InvitePage() {
  const { token = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const user = session.data ?? null;
  const preview = useInvitePreview(token, user?.id ?? null);
  const accept = useAcceptInvite();
  usePageTitle(preview.data ? `Join ${preview.data.group.name}` : "Invite");

  if (session.isPending || preview.isPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (preview.isLoadingError) {
    const expired = expiredInviteFrom(preview.error);
    const gone = preview.error instanceof ApiError && preview.error.status === 404;
    const home = (
      <Link to="/" className={buttonClasses("secondary")}>
        Go to Friendship Wrapped
      </Link>
    );

    if (expired) {
      return (
        <StateMessage
          headingLevel="h1"
          emoji="⌛"
          title="This invite has expired"
          description={
            <>
              <span className="wrap-anywhere">{expired.invitedBy}</span> invited you to join{" "}
              <span className="wrap-anywhere">
                {expired.groupEmoji} {expired.groupName}
              </span>
              , but the link has run out. Ask <span className="wrap-anywhere">{expired.invitedBy}</span> for a new one.
            </>
          }
          action={home}
        />
      );
    }
    return gone ? (
      <StateMessage
        headingLevel="h1"
        emoji="🔗"
        title="This invite doesn't work"
        description="The link may have been turned off, or it wasn't copied in full. Ask your friend for a new one."
        action={home}
      />
    ) : (
      <StateMessage
        headingLevel="h1"
        emoji="📡"
        title="Couldn't load this invite"
        description="Check your connection and try again."
        action={<Button onClick={() => void preview.refetch()}>Try again</Button>}
      />
    );
  }

  const { group, invitedBy, memberOfGroupId } = preview.data;
  // After signing up or logging in, people come straight back here.
  const returnHere = { from: location.pathname };

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-sm text-sub wrap-anywhere">
        {invitedBy ? `${invitedBy} invited you to join` : "You've been invited to join"}
      </p>
      <div className="my-3">
        <GroupAvatar group={group} size={80} memberColors={false} />
      </div>
      <h1 className="text-2xl font-semibold font-stretch-112% tracking-tight wrap-anywhere">{group.name}</h1>
      <p className="text-sm text-sub">{formatMemberCount(group.memberCount)}</p>

      <div className="mt-6 flex w-full flex-col gap-3">
        {memberOfGroupId ? (
          <>
            <p className="text-sm text-sub">You're already in this group.</p>
            <Link to={`/groups/${memberOfGroupId}`} className={buttonClasses("primary", "w-full")}>
              Open group
            </Link>
          </>
        ) : user ? (
          <>
            {accept.isError && <Alert>{getFormError(accept.error)}</Alert>}
            <Button
              className="w-full wrap-anywhere"
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(token, { onSuccess: (joined) => navigate(`/groups/${joined.id}`, { replace: true }) })
              }
            >
              {accept.isPending ? "Joining…" : `Join ${group.name}`}
            </Button>
            <p className="text-xs text-sub">Joining as @{user.username}</p>
          </>
        ) : (
          <>
            <Link to="/auth/register" state={returnHere} className={buttonClasses("primary", "w-full")}>
              Create an account to join
            </Link>
            <Link to="/auth/login" state={returnHere} className={buttonClasses("secondary", "w-full")}>
              I already have an account
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
