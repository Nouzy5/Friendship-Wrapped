import { Link } from "react-router";
import { Card } from "../components/ui/Card";
import { useCurrentUser } from "../features/auth/hooks";
import { CreateGroupForm } from "../features/groups/components/CreateGroupForm";

/** First stop after registering (unless they arrived through an invite link). */
export function OnboardingPage() {
  const user = useCurrentUser();
  const firstName = user.displayName.split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Welcome, {firstName}! 🎉</h1>
        <p className="mt-2 text-ink-200">
          Friendship Wrapped happens in private groups. Start one for your friends, and you'll get a link to invite
          them.
        </p>
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold tracking-wide text-ink-200 uppercase">Create your first group</h2>
        <CreateGroupForm />
      </Card>

      <p className="text-center text-sm text-ink-400">
        Got an invite link from a friend? Just open it to join.{" "}
        <Link to="/home" className="font-semibold text-brand-orange hover:underline">
          Skip for now
        </Link>
      </p>
    </div>
  );
}
