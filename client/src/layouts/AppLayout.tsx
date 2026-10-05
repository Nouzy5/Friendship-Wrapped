import { Link, Outlet } from "react-router";
import { Wordmark } from "../components/Wordmark";
import { Avatar } from "../components/ui/Avatar";
import { useCurrentUser } from "../features/auth/hooks";

/** Shell for signed-in pages. Bottom navigation arrives with the features it links to. */
export function AppLayout() {
  const user = useCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-ink-800/80 bg-ink-950/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
          <Link to="/home" className="flex items-center gap-2 rounded-lg">
            <img src="/favicon.svg" alt="" className="size-7 rounded-lg" />
            <Wordmark className="text-lg" />
          </Link>
          <Link to="/profile" aria-label="Your profile" className="rounded-full">
            <Avatar name={user.displayName} seed={user.id} size="sm" />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <Outlet />
      </main>
    </div>
  );
}
