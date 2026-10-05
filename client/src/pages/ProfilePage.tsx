import { Link } from "react-router";
import { Avatar } from "../components/ui/Avatar";
import { Card } from "../components/ui/Card";
import { SettingsIcon } from "../components/ui/icons";
import { headerIconLinkClasses, PageHeader } from "../components/ui/PageHeader";
import { useCurrentUser } from "../features/auth/hooks";
import { EditProfileForm } from "../features/profile/components/EditProfileForm";
import { formatMonthYear } from "../lib/format";

export function ProfilePage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-6 py-2">
      <PageHeader
        title="Profile"
        action={
          <Link to="/settings" aria-label="Settings" className={headerIconLinkClasses}>
            <SettingsIcon className="size-5" />
          </Link>
        }
      />

      <section className="flex flex-col items-center text-center" aria-label="Your profile">
        <Avatar name={user.displayName} seed={user.id} size="xl" />
        <p className="mt-4 text-2xl font-bold">{user.displayName}</p>
        <p className="text-ink-400">@{user.username}</p>
        <p className="mt-1 text-xs text-ink-400">Joined {formatMonthYear(user.createdAt)}</p>
      </section>

      <Card>
        <EditProfileForm user={user} />
      </Card>
    </div>
  );
}
