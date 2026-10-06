import { Outlet, ScrollRestoration } from "react-router";

/**
 * Shared backdrop for every page. Child layouts provide their own <main>.
 * New pages open at the top; "back" returns to where you were (e.g. deep in a feed).
 */
export function RootLayout() {
  return (
    // overflow-x-clip (not -hidden) trims the glow without becoming a scroll container,
    // which would stop the app header from sticking.
    <div className="relative isolate min-h-dvh overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-96 bg-linear-to-br from-brand-rose/25 via-brand-orange/15 to-transparent blur-3xl"
      />
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}
