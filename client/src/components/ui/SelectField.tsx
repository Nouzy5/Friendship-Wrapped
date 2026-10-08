import { useId, type ComponentPropsWithoutRef } from "react";
import { FieldMessage, fieldClasses } from "./field";

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
      <label htmlFor={selectId} className="text-[0.9375rem] font-medium">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? messageId : undefined}
        className={`${fieldClasses(Boolean(error))} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <FieldMessage id={messageId} error message={error} />}
    </div>
  );
}
