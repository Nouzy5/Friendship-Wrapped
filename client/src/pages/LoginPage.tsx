import { Link, useLocation } from "react-router";
import { LoginForm } from "../features/auth/components/LoginForm";

export function LoginPage() {
  const location = useLocation();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Log in</h1>
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
