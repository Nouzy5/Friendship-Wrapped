import { useId, useState, type FormEvent } from "react";
import { SendIcon } from "../../../components/ui/icons";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import type { Photo } from "../../photos/types";
import { useAddComment } from "../hooks";

/** Matches the server's limit. */
const MAX_LENGTH = 500;

export function CommentComposer({ photo }: { photo: Pick<Photo, "id" | "groupId"> }) {
  const add = useAddComment(photo);
  const [body, setBody] = useState("");
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const error = getFieldErrors(add.error).body ?? getFormError(add.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || add.isPending) return;
    add.mutate(body, { onSuccess: () => setBody("") });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Add a comment
        </label>
        {/* text-base (16px) stops iOS Safari from zooming in on focus. */}
        <input
          id={inputId}
          value={body}
          maxLength={MAX_LENGTH}
          placeholder="Add a comment…"
          autoComplete="off"
          enterKeyHint="send"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setBody(event.target.value);
            if (add.isError) add.reset();
          }}
          className={`h-12 min-w-0 flex-1 rounded-full border-2 bg-surface px-4 text-base text-fg transition outline-none placeholder:text-sub focus:border-fg ${
            error ? "border-fg" : "border-transparent"
          }`}
        />
        <button
          type="submit"
          aria-label="Post comment"
          disabled={!body.trim() || add.isPending}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-inverse text-on-inverse transition active:scale-95 disabled:opacity-30"
        >
          <SendIcon className="size-5" />
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="px-4 text-[0.8125rem] font-medium">
          {error}
        </p>
      )}
    </form>
  );
}
