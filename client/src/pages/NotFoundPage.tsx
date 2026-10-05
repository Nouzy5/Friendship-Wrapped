import { Link } from "react-router";
import { StateMessage } from "../components/ui/StateMessage";

export function NotFoundPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <StateMessage
        emoji="🧭"
        title="Page not found"
        description="This page doesn't exist, or it may have moved."
        action={
          <Link to="/" className="text-sm font-semibold text-brand-orange hover:underline">
            Back to home
          </Link>
        }
      />
    </div>
  );
}
