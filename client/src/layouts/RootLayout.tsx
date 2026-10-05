import { Outlet } from "react-router";

/** Shared backdrop for every page. Child layouts provide their own <main>. */
export function RootLayout() {
  return (
    <div className="relative isolate min-h-dvh overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-96 bg-linear-to-br from-brand-rose/25 via-brand-orange/15 to-transparent blur-3xl"
      />
      <Outlet />
    </div>
  );
}
