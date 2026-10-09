import { useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import { DEFAULT_MOMENT_HOURS, MOMENT_DURATIONS, type MomentHours, type NewMoment } from "../types";

/** A few emoji to put on a moment, or none. */
const MOMENT_EMOJIS = ["🌙", "🏖️", "🎉", "🍕", "⚽", "🏔️", "🎸", "🔥"];

type StartMomentDialogProps = {
  open: boolean;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
  onSubmit: (moment: NewMoment) => void;
};

const durationOptions = MOMENT_DURATIONS.map(({ hours, label }) => ({ value: String(hours), label }));

/** Asks what is happening and for how long, to start a moment the whole group can post into. */
export function StartMomentDialog(props: StartMomentDialogProps) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title="Start a moment" busy={props.isPending}>
      {/* Mounted per opening, so the form starts empty each time. */}
      <StartMomentForm {...props} />
    </Dialog>
  );
}

function StartMomentForm({ onClose, isPending, error, onSubmit }: StartMomentDialogProps) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [hours, setHours] = useState<MomentHours>(DEFAULT_MOMENT_HOURS);
  const formError = getFormError(error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ title, emoji, durationHours: hours });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      <p className="text-[0.9375rem] text-sub">
        Friends are told, and for a while everyone can post into it. It closes by itself.
      </p>
      {formError && <Alert>{formError}</Alert>}
      <TextField
        label="What's happening?"
        name="title"
        placeholder="Friday at the lake"
        maxLength={60}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={getFieldErrors(error).title}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[0.9375rem] font-medium">Emoji (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {MOMENT_EMOJIS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={emoji === candidate}
              onClick={() => setEmoji(emoji === candidate ? null : candidate)}
              className={`grid size-11 place-items-center rounded-2xl bg-bg text-2xl transition hover:bg-line ${
                emoji === candidate ? "ring-2 ring-accent" : ""
              }`}
            >
              {candidate}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-[0.9375rem] font-medium">Open for</span>
        <SegmentedControl
          label="How long the moment stays open"
          options={durationOptions}
          value={String(hours)}
          onChange={(value) => setHours(Number(value) as MomentHours)}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !title.trim()}>
          {isPending ? "Starting…" : "Start moment"}
        </Button>
      </div>
    </form>
  );
}
