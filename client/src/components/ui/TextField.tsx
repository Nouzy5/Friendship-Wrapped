import { useId, type ComponentPropsWithoutRef } from "react";
import { FieldMessage, fieldClasses } from "./field";

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
      <label htmlFor={inputId} className="text-[0.9375rem] font-medium">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`${fieldClasses(Boolean(error))} ${className}`}
        {...props}
      />
      {message && <FieldMessage id={messageId} error={Boolean(error)} message={message} />}
    </div>
  );
}
