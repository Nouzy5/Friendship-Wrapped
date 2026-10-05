import { ApiError } from "./api-client";

export type FieldErrors = Partial<Record<string, string>>;

type FieldIssue = { path: string; message: string };

function isFieldIssue(value: unknown): value is FieldIssue {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FieldIssue).path === "string" &&
    typeof (value as FieldIssue).message === "string"
  );
}

/** Per-field messages from an API error's `details` (first message per field wins). */
export function getFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};

  const fields: FieldErrors = {};
  for (const issue of error.details) {
    if (isFieldIssue(issue) && !(issue.path in fields)) fields[issue.path] = issue.message;
  }
  return fields;
}

/** A form-level message, or undefined when the error is already shown next to fields. */
export function getFormError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (Object.keys(getFieldErrors(error)).length > 0) return undefined;
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}
