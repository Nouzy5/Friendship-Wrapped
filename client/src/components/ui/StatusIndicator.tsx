export type Status = "checking" | "ok" | "down" | "unknown";

const statusStyles: Record<Status, { dot: string; label: string }> = {
  checking: { dot: "bg-sub animate-pulse", label: "Checking…" },
  ok: { dot: "bg-fg", label: "Operational" },
  down: { dot: "border-2 border-fg", label: "Unavailable" },
  unknown: { dot: "bg-switch-off", label: "Unknown" },
};

type StatusIndicatorProps = {
  status: Status;
  /** Overrides the default label for the status. */
  label?: string;
};

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
  const style = statusStyles[status];

  return (
    <span className="inline-flex items-center gap-2 text-sm text-sub">
      <span aria-hidden className={`size-2.5 rounded-full ${style.dot}`} />
      {label ?? style.label}
    </span>
  );
}
