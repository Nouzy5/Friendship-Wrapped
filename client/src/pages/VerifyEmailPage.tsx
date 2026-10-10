import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { Alert } from "../components/ui/Alert";
import { buttonClasses } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { useSession, useVerifyEmail } from "../features/auth/hooks";
import { ApiError } from "../lib/api-client";
import { getFormError } from "../lib/form-errors";
import { usePageTitle } from "../lib/usePageTitle";

/**
 * Where the link in the confirmation email lands. It confirms the address as soon as it opens
 * (from a mail app, often on another device than the one signed up on, so no session is needed).
 * The link is only used from this page's script, never by the page load itself, so mail scanners
 * that open every link in a message can't use it up.
 */
export function VerifyEmailPage() {
  usePageTitle("Confirm your email");
  const [params] = useSearchParams();
  const token = params.get("token");
  const session = useSession();
  const verify = useVerifyEmail();
  // Once per visit, even where React runs effects twice in development.
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  const signedIn = Boolean(session.data);
  const alreadyConfirmed = signedIn && session.data?.emailVerified === true;
  const done = verify.isSuccess || (verify.isError && alreadyConfirmed);
  // An admin address is only confirmed from a browser that's signed in to the account that has it.
  const needsSignIn = verify.error instanceof ApiError && verify.error.code === "SIGN_IN_TO_CONFIRM";

  let heading = "Confirming your email…";
  if (done) heading = "Email confirmed";
  else if (needsSignIn) heading = "Log in to confirm";
  else if (verify.isError || !token) heading = "That link didn't work";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{heading}</h1>

      {!token && <Alert>This link is missing something. Open it again from the email, or ask for a new one in the app.</Alert>}

      {token && (verify.isPending || verify.isIdle) && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}

      {verify.isSuccess && (
        <Alert tone="success">
          {verify.data.email} is confirmed.{signedIn ? "" : " Log in to get started."}
        </Alert>
      )}

      {verify.isError && alreadyConfirmed && <Alert tone="success">Your email is already confirmed. You're in.</Alert>}

      {verify.isError && !alreadyConfirmed && needsSignIn && <Alert>{getFormError(verify.error)}</Alert>}

      {verify.isError && !alreadyConfirmed && !needsSignIn && (
        <Alert>{getFormError(verify.error)}. Log in and use "Send the email again" for a fresh link.</Alert>
      )}

      {(done || verify.isError || !token) &&
        (needsSignIn && !signedIn ? (
          // After logging in, come straight back to this link.
          <Link to="/auth/login" state={{ from: `/verify-email?token=${token}` }} className={buttonClasses()}>
            Log in
          </Link>
        ) : (
          <Link to={signedIn ? "/home" : "/auth/login"} className={buttonClasses()}>
            {signedIn ? "Continue to the app" : "Log in"}
          </Link>
        ))}
    </div>
  );
}
