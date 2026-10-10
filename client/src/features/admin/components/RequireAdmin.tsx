import { Outlet } from "react-router";
import { NotFoundPage } from "../../../pages/NotFoundPage";
import { useCurrentUser } from "../../auth/hooks";

/**
 * Layout route inside `RequireAuth`: the admin panel is for the server's owner only. Everyone
 * else gets the same page as for any address that doesn't exist (the API says 404 to them too).
 */
export function RequireAdmin() {
  const user = useCurrentUser();
  if (!user.isAdmin) return <NotFoundPage />;
  return <Outlet />;
}
