import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Button, buttonClasses } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { useRequestPasswordReset } from "../features/auth/hooks";
import { getFieldErrors, getFormError } from "../lib/form-errors";
import { usePageTitle } from "../lib/usePageTitle";

/** The server sends one email a minute to a person (and says nothing when it doesn't), so "send again" waits as long. */
const SEND_AGAIN_AFTER_SECONDS = 60;

/**
 * "I forgot my password": asks for an email address or a username and emails a link to choose a new
 * password. The answer is the same whether or not an account matched, so this page can't say who has one.
 */
export function ForgotPasswordPage() {
  usePageTitle("Reset your password");
  const location = useLocation();
  const request = useRequestPasswordReset();
  const [identifier, setIdentifier] = useState("");
  /** What was asked for, once the request went through. */
  const [asked, setAsked] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  const fieldErrors = getFieldErrors(request.error);
  const formError = getFormError(request.error);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const name = identifier.trim();
    request.mutate(name, {
      onSuccess: () => {
        setAsked(name);
        setWait(SEND_AGAIN_AFTER_SECONDS);
      },
    });
  }

  const backToLogin = (
    <Link to="/auth/login" state={location.state} className={buttonClasses("ghost")}>
      Back to log in
    </Link>
  );

  if (asked !== null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Check your inbox</h1>
        <Alert tone="success">
          If an account matches <strong className="font-semibold wrap-anywhere">{asked}</strong>, we've emailed it a link to
          choose a new password. It works for an hour.
        </Alert>
        <p className="text-[0.9375rem] text-sub">
          Nothing there? Look in your spam folder, and check the address. Accounts made before we asked for an email have none on
          file, so they can't be reset this way.
        </p>
        {formError && <Alert>{formError}</Alert>}
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={() => send()} disabled={request.isPending || wait > 0}>
            {request.isPending ? "Sending…" : wait > 0 ? `Send it again in ${wait}s` : "Send the email again"}
          </Button>
          {backToLogin}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">Reset your password</h1>
        <p className="text-[0.9375rem] text-sub">Enter your email or username and we'll email you a link to choose a new one.</p>
      </div>

      <form noValidate onSubmit={send} className="flex flex-col gap-4">
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="Email or username"
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          maxLength={254}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          error={fieldErrors.identifier}
        />
        <Button type="submit" className="mt-2" disabled={request.isPending || !identifier.trim()}>
          {request.isPending ? "Sending…" : "Email me a link"}
        </Button>
      </form>

      <div className="flex flex-col">{backToLogin}</div>
    </div>
  );
}
