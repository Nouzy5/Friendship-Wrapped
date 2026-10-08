import { AlertIcon } from "./icons";

/**
 * Shared look of text inputs, selects and text areas. text-base (16px) stops iOS Safari from
 * zooming in on focus. Errors get a heavier outline and a marked message rather than red.
 * On a grey panel (Card) fields take the page colour instead, via --field-bg.
 */
export function fieldClasses(invalid: boolean): string {
  return `min-h-12 rounded-2xl border-2 bg-(--field-bg,var(--surface)) px-4 text-base text-fg transition outline-none placeholder:text-sub focus:border-fg ${
    invalid ? "border-fg" : "border-transparent"
  }`;
}

export function FieldMessage({ id, error, message }: { id: string; error: boolean; message: string }) {
  return (
    <p id={id} className={`flex items-start gap-1.5 text-[0.8125rem] ${error ? "font-medium text-fg" : "text-sub"}`}>
      {error && <AlertIcon className="mt-px size-4 shrink-0" />}
      {message}
    </p>
  );
}
