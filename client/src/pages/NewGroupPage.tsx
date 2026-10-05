import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { CreateGroupForm } from "../features/groups/components/CreateGroupForm";

export function NewGroupPage() {
  return (
    <div className="flex flex-col gap-6 py-2">
      <PageHeader title="New group" backTo="/home" backLabel="Back to home" />
      <Card>
        <CreateGroupForm />
      </Card>
    </div>
  );
}
