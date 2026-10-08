import type { ComponentPropsWithoutRef } from "react";

type CardProps = ComponentPropsWithoutRef<"section">;

/** A soft grey panel. No border or shadow: in this design, structure comes from space and tone. */
export function Card({ className = "", ...props }: CardProps) {
  return <section className={`rounded-3xl bg-surface p-5 [--field-bg:var(--bg)] ${className}`} {...props} />;
}
