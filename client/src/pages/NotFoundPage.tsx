import { Link } from "react-router";
import { buttonClasses } from "../components/ui/Button";
import { StateMessage } from "../components/ui/StateMessage";
import { usePageTitle } from "../lib/usePageTitle";

export function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <StateMessage
        headingLevel="h1"
        emoji="🧭"
        title="Page not found"
        description="This page doesn't exist, or it may have moved."
        action={
          <Link to="/" className={buttonClasses()}>
            Back to home
          </Link>
        }
      />
    </main>
  );
}
