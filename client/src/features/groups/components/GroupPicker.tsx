import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "../../../components/ui/icons";
import { formatMemberCount } from "../../../lib/format";
import { useMyGroups } from "../hooks";
import type { Group } from "../types";
import { GroupAvatar } from "./GroupAvatar";

type GroupPickerProps = {
  current: Group;
  onSelect: (group: Group) => void;
  /** "title": the big name at the top of the feed. "pill": a compact chip (Memories, the camera). */
  variant?: "title" | "pill";
  /** Read out before the name, e.g. "Sharing with". */
  context?: string;
  /** A "New group" entry at the end of the list. */
  showNewGroup?: boolean;
  /** Which way the list opens, so it stays on screen. */
  align?: "left" | "right" | "center";
};

/** Switches between your groups: the current one's name opens a list of all of them. */
export function GroupPicker({ current, onSelect, variant = "title", context = "Showing", showNewGroup = false, align = "left" }: GroupPickerProps) {
  const groups = useMyGroups();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrapper.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerClasses =
    variant === "title"
      ? "flex min-h-11 min-w-0 items-center gap-1 text-[1.625rem] leading-tight font-semibold font-stretch-112%"
      : "flex h-11 min-w-0 items-center gap-2 rounded-full bg-surface pr-3 pl-1.5 text-[0.9375rem] font-semibold transition hover:bg-line";

  return (
    <div ref={wrapper} className="relative min-w-0">
      <button
        ref={button}
        type="button"
        aria-label={`${context} ${current.name}. Change group`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={triggerClasses}
      >
        {variant === "pill" && <GroupAvatar group={current} size={32} />}
        <span className="truncate">{current.name}</span>
        <ChevronDownIcon className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""} ${variant === "title" ? "size-5" : "size-4"}`} strokeWidth={2.4} />
      </button>

      {open && (
        <div className={`absolute top-full z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] ${{ left: "left-0 origin-top-left animate-menu-in", right: "right-0 origin-top-right animate-menu-in", center: "left-1/2 -translate-x-1/2 origin-top animate-menu-in" }[align]} overflow-hidden rounded-[1.25rem] bg-raised py-1.5 shadow-xl shadow-black/15 ring-1 ring-line`}>
          <div id={listId} role="listbox" aria-label="Your groups" className="max-h-[50dvh] overflow-y-auto">
            {(groups.data ?? [current]).map((group, index) => (
              <button
                key={group.id}
                type="button"
                role="option"
                aria-selected={group.id === current.id}
                onClick={() => {
                  setOpen(false);
                  onSelect(group);
                }}
                className="flex min-h-15 w-full animate-list-in items-center gap-3 px-3 text-left transition hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
                style={{ animationDelay: `${index * 35}ms` }}
              >
                <GroupAvatar group={group} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base">{group.name}</span>
                  <span className="text-[0.8125rem] text-sub">{formatMemberCount(group.memberCount)}</span>
                </span>
                {group.id === current.id && <CheckIcon className="size-5 shrink-0" />}
              </button>
            ))}
          </div>
          {showNewGroup && (
            <Link
              to="/groups/new"
              onClick={() => setOpen(false)}
              className="flex min-h-14 items-center gap-3 border-t border-line px-3 font-semibold transition hover:bg-surface"
            >
              <span aria-hidden className="grid size-9 place-items-center rounded-[0.6875rem] bg-surface">
                <PlusIcon className="size-5" />
              </span>
              New group
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
