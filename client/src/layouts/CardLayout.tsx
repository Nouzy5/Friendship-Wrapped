import { Outlet } from "react-router";
import { Wordmark } from "../components/Wordmark";
import { Card } from "../components/ui/Card";

/** Brand header above a single centered card: login, register and invite pages. */
export function CardLayout() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 pt-[max(env(safe-area-inset-top),2.5rem)] pb-[max(env(safe-area-inset-bottom),2.5rem)]">
      <div className="text-center">
        <img src="/favicon.svg" alt="" className="mx-auto size-14 rounded-2xl shadow-lg shadow-brand-rose/30" />
        <p className="mt-4 text-3xl">
          <Wordmark />
        </p>
        <p className="mt-2 text-sm text-ink-200">Capture your year together. Relive it as a story.</p>
      </div>

      <Card className="p-6">
        <Outlet />
      </Card>
    </main>
  );
}
