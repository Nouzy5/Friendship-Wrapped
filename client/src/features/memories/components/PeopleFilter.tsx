import { memberFill } from "../../../lib/member-colors";
import { useCurrentUser } from "../../auth/hooks";
import { useGroupMembers } from "../../groups/hooks";

type PeopleFilterProps = {
  groupId: string;
  /** The member whose photos are shown, or null for everyone's. */
  selected: string | null;
  onSelect: (userId: string | null) => void;
};

const chipClasses = (selected: boolean) =>
  `inline-flex h-11 shrink-0 items-center gap-2 rounded-full text-[0.9375rem] transition-[background-color,color,scale] duration-200 active:scale-95 ${
    selected ? "bg-inverse px-4 font-semibold text-on-inverse" : "bg-surface pr-3.5 pl-2.5 font-medium hover:bg-line"
  }`;

/** "Taken by": everyone, or one person's photos. Each person is marked with their colour. */
export function PeopleFilter({ groupId, selected, onSelect }: PeopleFilterProps) {
  const me = useCurrentUser();
  const members = useGroupMembers(groupId);
  const people = [...(members.data ?? [])].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));

  if (people.length < 2) return null;

  return (
    <div role="group" aria-label="Taken by" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={chipClasses(selected === null)}>
        Everyone
      </button>
      {people.map((member) => {
        const isSelected = member.user.id === selected;
        return (
          <button
            key={member.user.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(isSelected ? null : member.user.id)}
            className={chipClasses(isSelected)}
          >
            <span aria-hidden className="size-4 rounded-full" style={{ background: memberFill(member.color).background }} />
            {member.user.id === me.id ? "You" : member.user.displayName.split(/\s+/)[0]}
          </button>
        );
      })}
    </div>
  );
}
