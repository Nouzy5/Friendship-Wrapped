import { useState, type FormEvent } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { getFieldErrors, getFormError } from "../../../lib/form-errors";
import { useRegister } from "../hooks";

/** The server validates everything; its field messages are shown inline. */
export function RegisterForm() {
  const register = useRegister();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const fieldErrors = getFieldErrors(register.error);
  const formError = getFormError(register.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    register.mutate({ displayName, username, password });
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {formError && <Alert>{formError}</Alert>}

      <TextField
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        maxLength={40}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={fieldErrors.displayName}
        hint="What your friends will see, e.g. Nicolas"
      />
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={20}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={fieldErrors.username}
        hint="3–20 characters: letters, numbers, periods and underscores"
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        hint="At least 8 characters"
      />

      <Button type="submit" className="mt-2" disabled={register.isPending}>
        {register.isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
