import { Link } from "react-router";
import { Card } from "../components/ui/Card";
import { useCurrentUser } from "../features/auth/hooks";
import { CreateGroupForm } from "../features/groups/components/CreateGroupForm";
import { usePageTitle } from "../lib/usePageTitle";

/** First stop after registering (unless they arrived through an invite link). */
export function OnboardingPage() {
  usePageTitle("Welcome");
  const user = useCurrentUser();
  const firstName = user.displayName.split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <h1 className="text-3xl font-semibold font-stretch-112% tracking-tight">Welcome, {firstName}! 🎉</h1>
        <p className="mt-2 text-sub">
          Friendship Wrapped happens in private groups. Start one for your friends, and you'll get a link to invite
          them.
        </p>
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-sub">Create your first group</h2>
        <CreateGroupForm />
      </Card>

      <p className="text-center text-sm text-sub">
        Got an invite link from a friend? Just open it to join.{" "}
        <Link to="/home" className="font-semibold text-fg underline underline-offset-2 hover:underline">
          Skip for now
        </Link>
      </p>
    </div>
  );
}
