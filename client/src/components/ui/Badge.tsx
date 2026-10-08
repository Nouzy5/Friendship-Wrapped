import type { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-fg">
      {children}
    </span>
  );
}
