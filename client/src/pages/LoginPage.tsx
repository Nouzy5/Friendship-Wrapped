import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { Alert } from "../components/ui/Alert";
import { LoginForm } from "../features/auth/components/LoginForm";
import { clearSignOutReason, signOutReason } from "../features/auth/sign-out";
import { usePageTitle } from "../lib/usePageTitle";

export function LoginPage() {
  usePageTitle("Log in");
  const location = useLocation();
  // Said once: read now, forgotten once this page has shown it.
  const [reason] = useState(signOutReason);
  useEffect(clearSignOutReason, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Log in</h1>
      {reason === "account-deleted" && (
        <Alert tone="success">Your account and everything you posted have been deleted.</Alert>
      )}
      <LoginForm />
      <p className="text-center text-sm text-ink-400">
        New here?{" "}
        {/* Carry the "return to" page across to registration. */}
        <Link to="/auth/register" state={location.state} className="font-semibold text-brand-orange hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
