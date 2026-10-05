import { useNavigate } from "react-router";
import { useCreateGroup } from "../hooks";
import { GroupForm } from "./GroupForm";

/** Creates a group and opens it, where the invite card is waiting. */
export function CreateGroupForm() {
  const createGroup = useCreateGroup();
  const navigate = useNavigate();

  return (
    <GroupForm
      submitLabel="Create group"
      pendingLabel="Creating…"
      isPending={createGroup.isPending}
      error={createGroup.error}
      onSubmit={(input) =>
        createGroup.mutate(input, { onSuccess: (group) => navigate(`/groups/${group.id}`, { replace: true }) })
      }
    />
  );
}
