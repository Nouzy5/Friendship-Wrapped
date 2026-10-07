import { Navigate, Outlet, useLocation } from "react-router";
import { Button } from "../../../components/ui/Button";
import { FullScreenLoader } from "../../../components/ui/Spinner";
import { StateMessage } from "../../../components/ui/StateMessage";
import { useSession } from "../hooks";
import { postLoginPath } from "../redirect";
import { signOutReason } from "../sign-out";

/** Layout route: renders its children only for signed-in users. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullScreenLoader />;

  if (session.isLoadingError) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <StateMessage
          headingLevel="h1"
          emoji="📡"
          title="Can't reach Friendship Wrapped"
          description="Check your connection and try again."
          action={<Button onClick={() => void session.refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  if (!session.data) {
    // After an expired session, come back here once signed in again; after signing out on
    // purpose, start fresh.
    const from = signOutReason() ? undefined : { from: `${location.pathname}${location.search}` };
    return <Navigate to="/auth/login" replace state={from} />;
  }

  return <Outlet />;
}

/** Layout route for login/register: signed-in users are sent on to the app. */
export function RedirectIfAuthenticated() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullScreenLoader />;

  if (session.data) {
    // Brand-new accounts start at onboarding unless they came from somewhere specific.
    const fallback = location.pathname === "/auth/register" ? "/onboarding" : "/home";
    return <Navigate to={postLoginPath(location.state, fallback)} replace />;
  }

  return <Outlet />;
}
