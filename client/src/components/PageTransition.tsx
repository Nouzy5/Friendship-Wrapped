import type { ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router";

/** Set on navigation state when stepping through photos, so the next one slides in from that side. */
export type StepDirection = "older" | "newer";

/** Back buttons are links that say so in their state (PageHeader). */
function wentBack(state: unknown): boolean {
  return (state as { back?: unknown } | null)?.back === true;
}

function stepOf(state: unknown): StepDirection | null {
  const step = (state as { step?: unknown } | null)?.step;
  return step === "older" || step === "newer" ? step : null;
}

/**
 * Animates a page in whenever the path changes. Tabs ("fade") rise into place; screens you step
 * into ("slide") come in from the right, and from the left when you go back. Stepping through
 * photos slides from the side you're heading to.
 */
export function PageTransition({ variant, children }: { variant: "fade" | "slide"; children: ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const step = stepOf(location.state);

  let animation: string;
  if (step === "older") animation = "animate-slide-from-right";
  else if (step === "newer") animation = "animate-slide-from-left";
  else if (variant === "fade") animation = "animate-page-fade";
  else animation = navigationType === "POP" || wentBack(location.state) ? "animate-page-back" : "animate-page-forward";

  return (
    <div key={location.pathname} className={animation}>
      {children}
    </div>
  );
}
