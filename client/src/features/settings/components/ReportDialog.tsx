import { useId, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { fieldClasses } from "../../../components/ui/field";
import { getFormError } from "../../../lib/form-errors";
import { toast } from "../../../lib/toast";
import { useSendReport } from "../hooks";

type ReportDialogProps = {
  open: boolean;
  onClose: () => void;
  /** What's being reported, if it's a photo or a person; otherwise it's a general problem. */
  photoId?: string;
  userId?: string;
  title?: string;
};

const MAX_LENGTH = 1000;

/** Tells us about a photo, a person or a problem with the app. */
export function ReportDialog({ open, onClose, photoId, userId, title = "Report a problem" }: ReportDialogProps) {
  const [message, setMessage] = useState("");
  const report = useSendReport();
  const fieldId = useId();

  function close() {
    setMessage("");
    report.reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} title={title} busy={report.isPending}>
      <form
        className="mt-3 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!message.trim()) return;
          report.mutate(
            { photoId, userId, message: message.trim() },
            {
              onSuccess: () => {
                toast("Thanks. We've got your report.");
                close();
              },
            },
          );
        }}
      >
        <label htmlFor={fieldId} className="text-[0.9375rem] text-sub">
          {photoId || userId ? "What's wrong? Only we see this, not your friends." : "What happened? The more detail, the better."}
        </label>
        <textarea
          id={fieldId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={MAX_LENGTH}
          rows={5}
          required
          className={`${fieldClasses(false)} resize-none py-3`}
        />
        {report.isError && <Alert>{getFormError(report.error)}</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={report.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={report.isPending || !message.trim()}>
            {report.isPending ? "Sending…" : "Send report"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
