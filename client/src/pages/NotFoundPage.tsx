import { Link } from "react-router";
import { StateMessage } from "../components/ui/StateMessage";

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <StateMessage
        headingLevel="h1"
        emoji="🧭"
        title="Page not found"
        description="This page doesn't exist, or it may have moved."
        action={
          <Link to="/" className="text-sm font-semibold text-brand-orange hover:underline">
            Back to home
          </Link>
        }
      />
    </main>
  );
}
