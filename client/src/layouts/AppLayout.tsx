import { Link, NavLink, Outlet } from "react-router";
import { Wordmark } from "../components/Wordmark";
import { Avatar } from "../components/ui/Avatar";
import type { ComponentType, SVGProps } from "react";
import { CameraIcon, HomeIcon, MemoriesIcon, WrappedIcon } from "../components/ui/icons";
import { useCurrentUser } from "../features/auth/hooks";
import { useWrappedList } from "../features/wrapped/hooks";

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex w-20 flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-xs font-medium transition ${
          isActive ? "text-ink-50" : "text-ink-400 hover:text-ink-200"
        }`
      }
    >
      <Icon className="size-6" />
      {label}
    </NavLink>
  );
}

/** Bottom navigation. Wrapped joins it once there's a Wrapped to show. */
function BottomNav() {
  const wrapped = useWrappedList();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-800/80 bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex h-16 w-full max-w-md items-center justify-around px-6">
        <li>
          <NavItem to="/home" label="Home" icon={HomeIcon} />
        </li>
        <li>
          {/* The camera is the app's main action, so it gets the big gradient button. */}
          <NavLink
            to="/camera"
            aria-label="Camera"
            className={({ isActive }) =>
              `-mt-6 grid size-16 place-items-center rounded-full bg-linear-to-br from-brand-rose via-brand-orange to-brand-gold text-ink-950 shadow-lg shadow-brand-rose/30 ring-4 ring-ink-950 transition active:scale-95 ${
                isActive ? "brightness-110" : "hover:brightness-110"
              }`
            }
          >
            <CameraIcon className="size-7" />
          </NavLink>
        </li>
        <li>
          <NavItem to="/memories" label="Memories" icon={MemoriesIcon} />
        </li>
        {wrapped.data && wrapped.data.length > 0 && (
          <li>
            <NavItem to="/wrapped" label="Wrapped" icon={WrappedIcon} />
          </li>
        )}
      </ul>
    </nav>
  );
}

/** Shell for signed-in pages: header, page content, bottom navigation. */
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
            <Avatar name={user.displayName} seed={user.id} src={user.avatarUrl} size="sm" />
          </Link>
        </div>
      </header>

      {/* Bottom padding keeps content clear of the fixed navigation bar. */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
