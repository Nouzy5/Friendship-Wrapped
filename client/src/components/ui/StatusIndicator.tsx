export type Status = "checking" | "ok" | "down" | "unknown";

const statusStyles: Record<Status, { dot: string; label: string }> = {
  checking: { dot: "bg-warning animate-pulse", label: "Checking…" },
  ok: { dot: "bg-success", label: "Operational" },
  down: { dot: "bg-danger", label: "Unavailable" },
  unknown: { dot: "bg-ink-400", label: "Unknown" },
};

type StatusIndicatorProps = {
  status: Status;
  /** Overrides the default label for the status. */
  label?: string;
};

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
  const style = statusStyles[status];

  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-200">
      <span aria-hidden className={`size-2.5 rounded-full ${style.dot}`} />
      {label ?? style.label}
    </span>
  );
}
