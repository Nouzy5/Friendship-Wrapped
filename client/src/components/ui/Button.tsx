import type { ComponentPropsWithoutRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-linear-to-r from-brand-rose via-brand-orange to-brand-gold text-ink-950 shadow-lg shadow-brand-rose/20 hover:brightness-110",
  secondary: "border border-ink-700 bg-ink-800 text-ink-50 hover:bg-ink-700",
  ghost: "text-ink-200 hover:bg-ink-800 hover:text-ink-50",
  danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
};

/** Button styling, also usable on links that should look like buttons. */
export function buttonClasses(variant: ButtonVariant = "primary", className = ""): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${className}`;
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
