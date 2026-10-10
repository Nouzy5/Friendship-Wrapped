import { Link, NavLink, Outlet } from "react-router";
import { PageTransition } from "../components/PageTransition";
import { ChevronLeftIcon } from "../components/ui/icons";
import { useCurrentUser } from "../features/auth/hooks";

const TABS = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/users", label: "Users", end: false },
  { to: "/admin/groups", label: "Groups", end: false },
  { to: "/admin/reports", label: "Reports", end: false },
  { to: "/admin/system", label: "System", end: false },
];

/** The admin panel's frame: wider than the app's phone-sized pages, with its own sections along the top. */
export function AdminLayout() {
  const user = useCurrentUser();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Link to="/settings" aria-label="Back to settings" className="-ml-3 grid size-11 place-items-center rounded-full transition hover:bg-surface">
          <ChevronLeftIcon className="size-6" />
        </Link>
        <p className="truncate text-sm text-sub">
          Admin panel · signed in as <span className="font-semibold text-fg">@{user.username}</span>
        </p>
      </div>

      <nav aria-label="Admin sections" className="-mx-4 mt-2 overflow-x-auto px-4 pb-1">
        <ul className="flex w-max gap-2">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center rounded-full px-4 text-[0.9375rem] font-semibold transition ${
                    isActive ? "bg-inverse text-on-inverse" : "bg-surface text-fg hover:bg-line"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">
        <PageTransition variant="fade">
          <Outlet />
        </PageTransition>
      </div>
    </main>
  );
}
