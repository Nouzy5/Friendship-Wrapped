export function Spinner({ className = "size-6" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-ink-700 border-t-brand-orange ${className}`}
    />
  );
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}
