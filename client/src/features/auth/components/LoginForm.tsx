import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import { useLogin } from "../hooks";

/** On success the session updates and the auth guard redirects; no navigation needed here. */
export function LoginForm() {
  const login = useLogin();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const fieldErrors = getFieldErrors(login.error);
  const formError = getFormError(login.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate({ identifier, password });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {formError && <Alert>{formError}</Alert>}

      <TextField
        label="Email or username"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={fieldErrors.identifier}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
      />
      {/* Carries the "return to" page along, like the link to registration. */}
      <Link
        to="/auth/forgot-password"
        state={location.state}
        className="-mt-1 self-start text-sm font-semibold text-fg underline underline-offset-2 hover:underline"
      >
        Forgot your password?
      </Link>

      <Button type="submit" className="mt-2" disabled={login.isPending}>
        {login.isPending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
