import type { ReactNode } from "react";
import { AlertIcon, CheckIcon } from "./icons";

/**
 * A message box: errors interrupt screen readers (role="alert"), confirmations wait their turn.
 * Marked by an icon rather than red, since colour is kept for people.
 */
export function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "success" }) {
  const Icon = tone === "danger" ? AlertIcon : CheckIcon;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className="flex animate-list-in items-start gap-2.5 rounded-2xl bg-surface px-4 py-3 text-[0.9375rem] font-medium"
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
