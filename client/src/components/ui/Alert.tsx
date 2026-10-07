import type { ReactNode } from "react";

const toneClasses = {
  danger: "border-danger/40 bg-danger/10 text-danger",
  success: "border-success/40 bg-success/10 text-success",
};

/** A message box: errors interrupt screen readers (role="alert"), confirmations wait their turn. */
export function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: keyof typeof toneClasses }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-2xl border px-4 py-3 text-sm ${toneClasses[tone]}`}
    >
      {children}
    </div>
  );
}
