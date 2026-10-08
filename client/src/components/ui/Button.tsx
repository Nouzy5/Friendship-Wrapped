import type { ComponentPropsWithoutRef } from "react";

/**
 * primary: black on light, white on dark. accent: your own colour (posting a photo).
 * danger looks like secondary: colour only ever means a person, so destructive actions
 * say what they do and ask first instead of turning red.
 */
type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-inverse text-on-inverse hover:opacity-90",
  accent: "bg-accent text-on-accent hover:brightness-105",
  secondary: "bg-surface text-fg hover:bg-line",
  ghost: "text-fg hover:bg-surface",
  danger: "bg-surface text-fg hover:bg-line",
};

/** Button styling, also usable on links that should look like buttons. */
export function buttonClasses(variant: ButtonVariant = "primary", className = ""): string {
  return `inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${variantClasses[variant]} ${className}`;
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
