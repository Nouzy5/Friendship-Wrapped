import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { ApiError } from "../../../lib/api-client";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import { sessionQueryKey } from "../../../lib/query-client";
import { toast } from "../../../lib/toast";
import { usePageTitle } from "../../../lib/usePageTitle";
import { CardFrame } from "../../../layouts/CardLayout";
import { useChangeEmail, useLogout, useResendVerificationEmail } from "../hooks";
import type { User } from "../types";

/** While the gate is up, ask the server now and then whether the link has been opened (on any device). */
const CHECK_EVERY_MS = 5000;

/** Seconds to wait, from the server's "too soon" answer. */
function cooldownFrom(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.code !== "EMAIL_COOLDOWN") return null;
  const seconds = (error.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
  return typeof seconds === "number" ? seconds : null;
}

/** Sets or replaces the address: for accounts that have none, and for a typo. */
function EmailForm({ user, onCancel, onDone }: { user: User; onCancel?: () => void; onDone: () => void }) {
  const change = useChangeEmail();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const errors = getFieldErrors(change.error);
  const formError = getFormError(change.error);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    change.mutate(
      { email, password },
      {
        onSuccess: () => {
          toast("Check your inbox for the link");
          onDone();
        },
      },
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {formError && <Alert>{formError}</Alert>}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={errors.email}
      />
      <TextField
        label="Your password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={errors.password}
        hint={`To confirm it's you${user.email ? "" : ", since this changes your account"}.`}
      />
      <div className="mt-2 flex flex-col gap-2">
        <Button type="submit" disabled={change.isPending || !email.trim() || !password}>
          {change.isPending ? "Sending…" : "Send me the link"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={change.isPending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** "Check your inbox": the link was sent, and this waits for it to be opened. */
function WaitingForLink({ user, onChangeAddress }: { user: User; onChangeAddress: () => void }) {
  const queryClient = useQueryClient();
  const resend = useResendVerificationEmail();
  const [cooldown, setCooldown] = useState(0);
  const [stillWaiting, setStillWaiting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sentAgain, setSentAgain] = useState(false);

  // The link may be opened on another device: check for it now and then, and when coming back to this tab.
  useEffect(() => {
    const check = () => void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    const timer = window.setInterval(() => {
      if (!document.hidden) check();
    }, CHECK_EVERY_MS);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [queryClient]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function checkNow() {
    setChecking(true);
    setStillWaiting(false);
    await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    setChecking(false);
    // If it worked, this page is gone already.
    setStillWaiting(true);
  }

  function sendAgain() {
    setSentAgain(false);
    resend.mutate(undefined, {
      onSuccess: () => {
        setSentAgain(true);
        setCooldown(60);
      },
      onError: (error) => {
        const seconds = cooldownFrom(error);
        if (seconds) setCooldown(seconds);
      },
    });
  }

  const resendError = cooldownFrom(resend.error) ? undefined : getFormError(resend.error);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9375rem] text-sub">
        We sent a link to <strong className="font-semibold text-fg wrap-anywhere">{user.email}</strong>. Open it, on this device or
        any other, and you'll be let in.
      </p>
      {resendError && <Alert>{resendError}</Alert>}
      {sentAgain && <Alert tone="success">Sent. It can take a minute to arrive; check your spam folder too.</Alert>}
      {stillWaiting && !checking && <Alert>Not confirmed yet. Open the link in the email first.</Alert>}

      <div className="mt-2 flex flex-col gap-2">
        <Button onClick={() => void checkNow()} disabled={checking}>
          {checking ? "Checking…" : "I've confirmed it"}
        </Button>
        <Button variant="secondary" onClick={sendAgain} disabled={resend.isPending || cooldown > 0}>
          {resend.isPending ? "Sending…" : cooldown > 0 ? `Send it again in ${cooldown}s` : "Send the email again"}
        </Button>
        <Button variant="ghost" onClick={onChangeAddress}>
          Use a different email
        </Button>
      </div>
    </div>
  );
}

/**
 * What a signed-in account sees until its email is confirmed: add an address (accounts from before
 * email was required have none), or open the link that was sent. Nothing else in the app loads.
 */
export function EmailGate({ user }: { user: User }) {
  const logout = useLogout();
  const [changing, setChanging] = useState(false);
  const needsAddress = user.email === null;
  usePageTitle(needsAddress ? "Add your email" : "Confirm your email");

  return (
    <CardFrame>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">{needsAddress ? "Add your email address" : changing ? "Use a different email" : "Check your inbox"}</h1>
          {needsAddress && (
            <p className="text-[0.9375rem] text-sub">
              Every account now needs an email address, so we can confirm it's you and tell you about new sign-ins. We'll send
              you a link to confirm it.
            </p>
          )}
          {!needsAddress && changing && (
            <p className="text-[0.9375rem] text-sub">We'll send the link to the new address instead of {user.email}.</p>
          )}
        </div>

        {needsAddress || changing ? (
          <EmailForm user={user} onCancel={needsAddress ? undefined : () => setChanging(false)} onDone={() => setChanging(false)} />
        ) : (
          <WaitingForLink user={user} onChangeAddress={() => setChanging(true)} />
        )}

        {logout.isError && <Alert>{getFormError(logout.error)}</Alert>}
        <p className="text-center text-sm text-sub">
          Signed in as @{user.username}.{" "}
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="font-semibold text-fg underline underline-offset-2 hover:underline disabled:opacity-40"
          >
            {logout.isPending ? "Logging out…" : "Log out"}
          </button>
        </p>
      </div>
    </CardFrame>
  );
}
