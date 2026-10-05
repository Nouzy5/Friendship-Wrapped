import { Outlet } from "react-router";

/** App shell. Navigation is added here as features ship. */
export function RootLayout() {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-96 bg-linear-to-br from-brand-rose/25 via-brand-orange/15 to-transparent blur-3xl"
      />
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <Outlet />
      </main>
    </div>
  );
}
