import { useId, type ComponentPropsWithoutRef } from "react";

type SelectFieldProps = ComponentPropsWithoutRef<"select"> & {
  label: string;
  error?: string;
};

/** A labelled <select>, styled to match TextField. */
export function SelectField({ label, error, id, className = "", children, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const messageId = `${selectId}-message`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-ink-200">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? messageId : undefined}
        className={`h-12 rounded-2xl border bg-ink-800/80 px-4 text-base text-ink-50 transition outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/30 ${
          error ? "border-danger" : "border-ink-700"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={messageId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
