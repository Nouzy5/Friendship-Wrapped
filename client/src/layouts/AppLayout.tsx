import type { ComponentType, SVGProps } from "react";
import { Link, NavLink, Outlet, useMatch } from "react-router";
import { PageTransition } from "../components/PageTransition";
import { HomeIcon, MemoriesIcon, WrappedIcon } from "../components/ui/icons";
import { useWrappedList } from "../features/wrapped/hooks";

const itemClasses = (active: boolean) =>
  `flex flex-col items-center gap-0.5 rounded-xl px-1 py-1 text-xs transition ${active ? "font-semibold text-fg" : "font-medium text-sub hover:text-fg"}`;

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <NavLink to={to} className={({ isActive }) => itemClasses(isActive)}>
      {({ isActive }) => (
        <>
          {/* The icon springs when its tab becomes the current one. */}
          <Icon className={`size-6 ${isActive ? "animate-bounce-once" : ""}`} />
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Home is a group's feed, so it's the current tab on any group page too. */
function HomeItem() {
  const onHome = useMatch("/home");
  const onFeed = useMatch("/groups/:groupId");
  const active = Boolean(onHome || (onFeed && onFeed.params.groupId !== "new"));

  return (
    <Link to="/home" aria-current={active ? "page" : undefined} className={itemClasses(active)}>
      <HomeIcon className={`size-6 ${active ? "animate-bounce-once" : ""}`} />
      Home
    </Link>
  );
}

/** Bottom navigation. Wrapped joins it once there's a Wrapped to show. */
function BottomNav() {
  const wrapped = useWrappedList();

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-16 w-full max-w-md auto-cols-fr grid-flow-col items-center px-2">
        <li>
          <HomeItem />
        </li>
        <li className="flex justify-center">
          {/* The camera is the app's main action: a shutter in your colour. */}
          <Link
            to="/camera"
            aria-label="Camera"
            className="flex size-[3.375rem] rounded-full border-4 border-accent p-1 transition-transform duration-200 hover:scale-105 active:scale-90"
          >
            <span className="flex-1 rounded-full bg-accent transition-colors duration-300" />
          </Link>
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

/** Shell for the main tabs: each page brings its own header; the navigation stays at the bottom. */
export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Bottom padding keeps content clear of the fixed navigation bar. */}
      <main className="mx-auto w-full max-w-md flex-1 pt-[env(safe-area-inset-top)] pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <PageTransition variant="fade">
          <Outlet />
        </PageTransition>
      </main>

      <BottomNav />
    </div>
  );
}

/** Settings and other screens you go into and come back from: no tab bar, just a back button. */
export function DetailLayout() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <PageTransition variant="slide">
        <Outlet />
      </PageTransition>
    </main>
  );
}
