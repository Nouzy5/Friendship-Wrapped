import { Link, useLocation } from "react-router";
import { RegisterForm } from "../features/auth/components/RegisterForm";

export function RegisterPage() {
  const location = useLocation();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Create your account</h1>
      <RegisterForm />
      <p className="text-center text-sm text-ink-400">
        Already have an account?{" "}
        <Link to="/auth/login" state={location.state} className="font-semibold text-brand-orange hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
