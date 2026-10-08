import { Outlet } from "react-router";
import { AppMark } from "../components/AppMark";
import { Wordmark } from "../components/Wordmark";

/** The app's name above a single form: login, register and invite pages. */
export function CardLayout() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),2.5rem)]">
      <div className="flex flex-col items-center text-center">
        <AppMark size={64} />
        <p className="mt-4 text-[1.75rem]">
          <Wordmark />
        </p>
        <p className="mt-1 text-[0.9375rem] text-sub">Capture your year together. Relive it as a story.</p>
      </div>

      <div className="px-1">
        <Outlet />
      </div>
    </main>
  );
}
