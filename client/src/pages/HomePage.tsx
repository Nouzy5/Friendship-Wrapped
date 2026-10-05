import { Card } from "../components/ui/Card";
import { StateMessage } from "../components/ui/StateMessage";
import { useCurrentUser } from "../features/auth/hooks";

export function HomePage() {
  const user = useCurrentUser();
  const firstName = user.displayName.split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Hey {firstName} 👋</h1>
        <p className="mt-1 text-ink-200">Good to have you here.</p>
      </div>

      <Card>
        <StateMessage
          emoji="🫶"
          title="Your groups will live here"
          description="Soon you'll be able to create a private group and invite your friends."
        />
      </Card>
    </div>
  );
}
