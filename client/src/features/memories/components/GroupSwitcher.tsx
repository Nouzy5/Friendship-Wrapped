import type { Group } from "../../groups/types";

type GroupSwitcherProps = { groups: Group[]; selectedId: string; onSelect: (groupId: string) => void };

/** Which group's memories to show, as a row of chips (it scrolls when there are many). */
export function GroupSwitcher({ groups, selectedId, onSelect }: GroupSwitcherProps) {
  return (
    <div role="group" aria-label="Group" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {groups.map((group) => {
        const selected = group.id === selectedId;
        return (
          <button
            key={group.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(group.id)}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
              selected
                ? "border-brand-orange/70 bg-brand-orange/15 text-ink-50"
                : "border-ink-700 text-ink-200 hover:border-ink-400"
            }`}
          >
            <span aria-hidden>{group.emoji}</span>
            {group.name}
          </button>
        );
      })}
    </div>
  );
}
