import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Button, buttonClasses } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { TextField } from "../components/ui/TextField";
import { useResetLinkCheck, useResetPassword } from "../features/auth/hooks";
import { ApiError } from "../lib/api-client";
import { getFieldErrors, getFormError } from "../lib/form-errors";
import { usePageTitle } from "../lib/usePageTitle";

/** A link that can't be used (any more), with the way to ask for another. */
function BrokenLink({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">That link didn't work</h1>
      <Alert>{message}</Alert>
      <p className="text-[0.9375rem] text-sub">Links work for an hour, and only once. Ask for a new one and use the newest email.</p>
      <Link to="/auth/forgot-password" className={buttonClasses()}>
        Email me a new link
      </Link>
    </div>
  );
}

/**
 * Where the link in a password reset email lands: choose a new password. Needs no session (the link
 * is opened from a mail app, by someone who can't log in). It looks at the link first, so nobody types
 * a password for one that has expired, and the link is only spent by the form being sent, never by the
 * page opening, so a mail scanner that opens every link can't use it up.
 */
export function ResetPasswordPage() {
  usePageTitle("Choose a new password");
  const [params] = useSearchParams();
  const token = params.get("token");
  const reset = useResetPassword();
  const link = useResetLinkCheck(token, !reset.isSuccess);

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const fieldErrors = getFieldErrors(reset.error);
  const formError = getFormError(reset.error);
  // The link was used (or expired) between the page opening and the form being sent.
  const spent = reset.error instanceof ApiError && reset.error.code === "INVALID_LINK";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (password !== repeat) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    reset.mutate({ token, newPassword: password });
  }

  if (reset.isSuccess) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Password changed</h1>
        <Alert tone="success">You're signed out everywhere. Log in with your new password.</Alert>
        <Link to="/auth/login" className={buttonClasses()}>
          Log in
        </Link>
      </div>
    );
  }

  if (!token) return <BrokenLink message="This link is missing something. Open it again from the email, or ask for a new one." />;
  if (spent) return <BrokenLink message={formError ?? "This link has expired or was already used"} />;

  if (link.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Choose a new password</h1>
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      </div>
    );
  }

  if (link.isError) {
    const bad = link.error instanceof ApiError && link.error.code === "INVALID_LINK";
    // Anything else (offline, a busy server) is not the link's fault: say what happened.
    return <BrokenLink message={bad ? "This link has expired or was already used" : (getFormError(link.error) ?? "Something went wrong")} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">Choose a new password</h1>
        <p className="text-[0.9375rem] text-sub">You'll be signed out of every device, and log in again with it.</p>
      </div>

      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setMismatch(false);
          }}
          error={fieldErrors.newPassword}
          hint="At least 8 characters"
        />
        <TextField
          label="Repeat the new password"
          name="repeatPassword"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => {
            setRepeat(event.target.value);
            setMismatch(false);
          }}
          error={mismatch ? "The two passwords don't match" : undefined}
        />
        <Button type="submit" className="mt-2" disabled={reset.isPending || !password || !repeat}>
          {reset.isPending ? "Saving…" : "Change my password"}
        </Button>
      </form>
    </div>
  );
}
