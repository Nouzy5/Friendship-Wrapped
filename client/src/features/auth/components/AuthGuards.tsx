import { Navigate, Outlet, useLocation } from "react-router";
import { Button } from "../../../components/ui/Button";
import { FullScreenLoader } from "../../../components/ui/Spinner";
import { StateMessage } from "../../../components/ui/StateMessage";
import { useSession } from "../hooks";
import { postLoginPath } from "../redirect";

/** Layout route: renders its children only for signed-in users. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullScreenLoader />;

  if (session.isError) {
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
    return <Navigate to="/auth/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return <Outlet />;
}

/** Layout route for login/register: signed-in users are sent on to the app. */
export function RedirectIfAuthenticated() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <FullScreenLoader />;
  if (session.data) return <Navigate to={postLoginPath(location.state)} replace />;

  return <Outlet />;
}
