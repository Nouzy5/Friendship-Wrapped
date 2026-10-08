import { Link, useLocation } from "react-router";
import { RegisterForm } from "../features/auth/components/RegisterForm";
import { usePageTitle } from "../lib/usePageTitle";

export function RegisterPage() {
  usePageTitle("Create account");
  const location = useLocation();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Create your account</h1>
      <RegisterForm />
      <p className="text-center text-sm text-sub">
        Already have an account?{" "}
        <Link to="/auth/login" state={location.state} className="font-semibold text-fg underline underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
