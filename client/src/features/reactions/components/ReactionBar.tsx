import { useEffect, useId, useRef, useState } from "react";
import { ReactIcon } from "../../../components/ui/icons";
import { memberFill } from "../../../lib/member-colors";
import { useCurrentUser } from "../../auth/hooks";
import { useGroupPeople } from "../../groups/hooks";
import type { Photo } from "../../photos/types";
import { haptic } from "../../../lib/haptics";
import { useReact } from "../hooks";
import { REACTIONS } from "../reactions";
import type { ReactionType } from "../types";

const MAX_DOTS = 4;

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

type Reactor = { userId: string; name: string; initial: string; color: ReturnType<typeof memberFill> };

/** The people behind one reaction, as overlapping dots in their colours. */
function ReactorDots({ reactors, ring }: { reactors: Reactor[]; ring: string }) {
  const shown = reactors.slice(0, MAX_DOTS);
  const more = reactors.length - shown.length;

  return (
    <span aria-hidden className="flex">
      {shown.map((reactor, index) => (
        <span
          key={reactor.userId}
          className={`grid size-5.5 animate-pop-in place-items-center rounded-full text-[0.6875rem] font-semibold ${index > 0 ? "-ml-1.5" : ""}`}
          style={{ backgroundColor: reactor.color.background, color: reactor.color.ink, boxShadow: `0 0 0 2px ${ring}` }}
        >
          {reactor.initial}
        </span>
      ))}
      {more > 0 && <span className="ml-1 self-center text-xs font-semibold">+{more}</span>}
    </span>
  );
}

/** The five reactions, to add yours or change it. */
function ReactionPicker({ mine, disabled, onPick }: { mine: ReactionType | null; disabled: boolean; onPick: (type: ReactionType | null) => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-label={mine ? "Change your reaction" : "React"}
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 place-items-center rounded-full bg-surface transition hover:bg-line disabled:opacity-40"
      >
        <ReactIcon className="size-[1.375rem]" />
      </button>
      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Reactions"
          className="absolute bottom-full left-0 z-20 mb-2 flex origin-bottom-left animate-menu-in gap-0.5 rounded-full bg-raised p-1 shadow-lg shadow-black/15 ring-1 ring-line"
        >
          {REACTIONS.map(({ type, emoji, label }, index) => (
            <button
              key={type}
              type="button"
              aria-label={label}
              style={{ animationDelay: `${40 + index * 30}ms` }}
              aria-pressed={mine === type}
              onClick={() => {
                onPick(mine === type ? null : type);
                setOpen(false);
              }}
              className={`grid size-11 animate-pop-in place-items-center rounded-full text-[1.375rem] transition-transform hover:scale-125 active:scale-95 ${mine === type ? "bg-accent" : ""}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Who reacted with what. Each reaction shows the people behind it as dots in their colours; your
 * own is outlined in yours. Tap a reaction to join it (or leave it), or the smiley to pick another.
 * Without access to the group (you posted this, then left) it's read-only, except taking back yours.
 */
export function ReactionBar({ photo }: { photo: Pick<Photo, "id" | "groupId" | "reactions" | "canInteract"> }) {
  const react = useReact(photo);
  const me = useCurrentUser();
  const { memberOf, colorOf } = useGroupPeople(photo.groupId);
  const { mine, counts } = photo.reactions;
  const reactors = photo.reactions.reactors ?? [];

  const choose = (type: ReactionType | null) => {
    haptic();
    react.mutate(type);
  };

  const groups = REACTIONS.map((reaction) => {
    const people: Reactor[] = reactors
      .filter((reactor) => reactor.type === reaction.type)
      .map((reactor) => {
        const isMe = reactor.userId === me.id;
        const name = isMe ? "you" : (memberOf(reactor.userId)?.user.displayName ?? "someone who left");
        return {
          userId: reactor.userId,
          name,
          initial: (Array.from(isMe ? me.displayName : name)[0] ?? "?").toUpperCase(),
          color: memberFill(colorOf(reactor.userId)),
        };
      });
    return { ...reaction, people, count: reactors.length ? people.length : counts[reaction.type] };
  }).filter((group) => group.count > 0);

  return (
    <div role="group" aria-label="Reactions" className="flex flex-wrap items-center gap-1.5">
      {groups.map(({ type, emoji, label, people, count }) => {
        const selected = mine === type;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={selected}
            aria-label={people.length ? `${label}, from ${listNames(people.map((person) => person.name))}` : `${label}, ${count}`}
            disabled={!photo.canInteract && !selected}
            onClick={() => choose(selected ? null : type)}
            className={`inline-flex h-11 animate-pop-in items-center gap-1.5 rounded-full pr-2.5 pl-2 transition active:scale-90 disabled:opacity-40 ${
              selected ? "bg-bg shadow-[inset_0_0_0_2px_var(--accent)]" : "bg-surface hover:bg-line"
            }`}
          >
            {/* Keyed so it bounces again each time it becomes yours. */}
            <span key={selected ? "mine" : "theirs"} aria-hidden className={`text-lg leading-none ${selected ? "animate-bounce-once" : ""}`}>
              {emoji}
            </span>
            {people.length ? (
              <ReactorDots reactors={people} ring={selected ? "var(--bg)" : "var(--surface)"} />
            ) : (
              <span className="text-sm font-semibold tabular-nums">{count}</span>
            )}
          </button>
        );
      })}
      <ReactionPicker mine={mine} disabled={!photo.canInteract} onPick={choose} />
    </div>
  );
}
