import { useEffect, useRef } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { OfflineBanner } from "../components/OfflineBanner";
import { Toaster } from "../components/Toaster";

/**
 * After moving to another page, focus its heading, so screen readers start there (as on
 * a full page load) and keyboard users don't start from the top. Pages that place focus
 * themselves (e.g. the Wrapped story) are left alone.
 */
function useFocusPageHeading() {
  const { pathname } = useLocation();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
}

/**
 * Shared backdrop for every page. Child layouts provide their own <main>.
 * New pages open at the top; "back" returns to where you were (e.g. deep in a feed).
 */
export function RootLayout() {
  useFocusPageHeading();

  return (
    // overflow-x-clip (not -hidden) trims the glow without becoming a scroll container,
    // which would stop the app header from sticking.
    <div className="relative isolate min-h-dvh overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-96 bg-linear-to-br from-brand-rose/25 via-brand-orange/15 to-transparent blur-3xl"
      />
      <Outlet />
      <OfflineBanner />
      <Toaster />
      <ScrollRestoration />
    </div>
  );
}
