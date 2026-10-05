import { useId, type ComponentPropsWithoutRef } from "react";

type TextFieldProps = ComponentPropsWithoutRef<"input"> & {
  label: string;
  error?: string;
  hint?: string;
};

export function TextField({ label, error, hint, id, className = "", ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink-200">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        // text-base (16px) stops iOS Safari from zooming in on focus.
        className={`h-12 rounded-2xl border bg-ink-800/80 px-4 text-base text-ink-50 transition outline-none placeholder:text-ink-400 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/30 ${
          error ? "border-danger" : "border-ink-700"
        } ${className}`}
        {...props}
      />
      {message && (
        <p id={messageId} className={`text-xs ${error ? "text-danger" : "text-ink-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
