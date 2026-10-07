import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { CreateGroupForm } from "../features/groups/components/CreateGroupForm";
import { usePageTitle } from "../lib/usePageTitle";

export function NewGroupPage() {
  usePageTitle("New group");
  return (
    <div className="flex flex-col gap-6 py-2">
      <PageHeader title="New group" backTo="/home" backLabel="Back to home" />
      <Card>
        <CreateGroupForm />
      </Card>
    </div>
  );
}
