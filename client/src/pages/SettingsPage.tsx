import { useNavigate } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useCurrentUser, useLogout } from "../features/auth/hooks";
import { SystemStatusCard } from "../features/system/SystemStatusCard";
import { getFormError } from "../lib/form-errors";

export function SettingsPage() {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate("/auth/login", { replace: true }) });
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

        <Button variant="danger" className="mt-4 w-full" onClick={handleLogout} disabled={logout.isPending}>
          {logout.isPending ? "Logging out…" : "Log out"}
        </Button>
      </Card>

      <SystemStatusCard />
    </div>
  );
}
