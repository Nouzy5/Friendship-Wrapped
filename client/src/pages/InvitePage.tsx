import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Button, buttonClasses } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { useSession } from "../features/auth/hooks";
import { GroupEmoji } from "../features/groups/components/GroupEmoji";
import { useAcceptInvite, useInvitePreview } from "../features/invites/hooks";
import { ApiError } from "../lib/api-client";
import { getFormError } from "../lib/form-errors";
import { formatMemberCount } from "../lib/format";

/** Public landing page for an invite link: preview the group, then sign up / log in / join. */
export function InvitePage() {
  const { token = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const user = session.data ?? null;
  const preview = useInvitePreview(token, user?.id ?? null);
  const accept = useAcceptInvite();

  if (session.isPending || preview.isPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (preview.isError) {
    const invalid = preview.error instanceof ApiError && preview.error.status === 404;
    return invalid ? (
      <StateMessage
        headingLevel="h1"
        emoji="🔗"
        title="This invite has expired"
        description="Invite links last 7 days, and the group owner can reset them. Ask your friend for a new one."
        action={
          <Link to="/" className={buttonClasses("secondary")}>
            Go to Friendship Wrapped
          </Link>
        }
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

  const { group, memberOfGroupId } = preview.data;
  // After signing up or logging in, people come straight back here.
  const returnHere = { from: location.pathname };

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-sm text-ink-200">You've been invited to join</p>
      <div className="my-3">
        <GroupEmoji emoji={group.emoji} size="lg" />
      </div>
      <h1 className="text-2xl font-black tracking-tight">{group.name}</h1>
      <p className="text-sm text-ink-400">{formatMemberCount(group.memberCount)}</p>

      <div className="mt-6 flex w-full flex-col gap-3">
        {memberOfGroupId ? (
          <>
            <p className="text-sm text-ink-200">You're already in this group.</p>
            <Link to={`/groups/${memberOfGroupId}`} className={buttonClasses("primary", "w-full")}>
              Open group
            </Link>
          </>
        ) : user ? (
          <>
            {accept.isError && <Alert>{getFormError(accept.error)}</Alert>}
            <Button
              className="w-full"
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(token, { onSuccess: (joined) => navigate(`/groups/${joined.id}`, { replace: true }) })
              }
            >
              {accept.isPending ? "Joining…" : `Join ${group.name}`}
            </Button>
            <p className="text-xs text-ink-400">Joining as @{user.username}</p>
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
