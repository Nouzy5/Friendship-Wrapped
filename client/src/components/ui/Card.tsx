import type { ComponentPropsWithoutRef } from "react";

type CardProps = ComponentPropsWithoutRef<"section">;

export function Card({ className = "", ...props }: CardProps) {
  return (
    <section
      className={`rounded-3xl border border-ink-700/70 bg-ink-900/80 p-5 shadow-xl shadow-black/30 backdrop-blur ${className}`}
      {...props}
    />
  );
}
