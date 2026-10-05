import { SystemStatusCard } from "../features/system/SystemStatusCard";

export function HomePage() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-8 py-8">
      <header className="text-center">
        <img src="/favicon.svg" alt="" className="mx-auto size-16 rounded-2xl shadow-lg shadow-brand-rose/30" />
        <h1 className="mt-5 text-4xl font-black tracking-tight">
          Friendship{" "}
          <span className="bg-linear-to-r from-brand-rose via-brand-orange to-brand-gold bg-clip-text text-transparent">
            Wrapped
          </span>
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-ink-200">
          Capture your year together. Relive it as a story.
        </p>
      </header>

      <SystemStatusCard />
    </div>
  );
}
