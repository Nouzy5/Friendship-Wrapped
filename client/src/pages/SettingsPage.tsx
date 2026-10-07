import { useState } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useCurrentUser, useLogout } from "../features/auth/hooks";
import { DeleteAccountDialog } from "../features/profile/components/DeleteAccountDialog";
import { SystemStatusCard } from "../features/system/SystemStatusCard";
import { getFormError } from "../lib/form-errors";
import { usePageTitle } from "../lib/usePageTitle";

export function SettingsPage() {
  usePageTitle("Settings");
  const user = useCurrentUser();
  const logout = useLogout();
  const [deleting, setDeleting] = useState(false);

  function handleLogout() {
    logout.mutate();
  }

  return (
    <div className="flex flex-col gap-6 py-2">
      <PageHeader title="Settings" backTo="/profile" backLabel="Back to profile" />

      <Card aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-sm font-semibold tracking-wide text-ink-200 uppercase">
          Account
        </h2>
        <p className="mt-2 text-sm text-ink-200">
          Signed in as <span className="font-semibold text-ink-50">@{user.username}</span>
        </p>

        {logout.isError && (
          <div className="mt-4">
            <Alert>{getFormError(logout.error)}</Alert>
          </div>
        )}

        <Button variant="secondary" className="mt-4 w-full" onClick={handleLogout} disabled={logout.isPending}>
          {logout.isPending ? "Logging out…" : "Log out"}
        </Button>
      </Card>

      <Card aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="text-sm font-semibold tracking-wide text-ink-200 uppercase">
          Delete account
        </h2>
        <p className="mt-2 text-sm text-ink-400">
          Permanently deletes your account, your photos and everything else you've posted.
        </p>
        <Button variant="danger" className="mt-4 w-full" onClick={() => setDeleting(true)}>
          Delete account…
        </Button>
        <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
      </Card>

      <SystemStatusCard />
    </div>
  );
}
