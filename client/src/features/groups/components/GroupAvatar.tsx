import { useState } from "react";
import { memberFill } from "../../../lib/member-colors";
import { useGroupMembers } from "../hooks";

type GroupAvatarProps = {
  /** No id for a group you can't see yet (an invite preview). */
  group: { id?: string; emoji: string; avatarUrl?: string | null };
  /** Pixels. The emoji only shows from 28px up. */
  size: number;
  /**
   * Off where you can't see the members (an invite you haven't accepted yet):
   * the emoji sits on a plain tile instead of everyone's colours.
   */
  memberColors?: boolean;
  className?: string;
};

/**
 * The group's picture: its photo if someone has set one, otherwise a badge made of every member's
 * colour, in the order they joined, with the group's emoji on top. Decorative: the name is always shown too.
 */
export function GroupAvatar({ group, size, memberColors = true, className = "" }: GroupAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const photo = group.avatarUrl && group.avatarUrl !== failedSrc ? group.avatarUrl : null;
  const members = useGroupMembers(group.id ?? "", { enabled: memberColors && !photo && Boolean(group.id) });
  const stripes = [...(members.data ?? [])]
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map((member) => memberFill(member.color).background);
  const radius = Math.round(size * 0.3);
  const disc = Math.round(size * 0.6);

  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 overflow-hidden bg-surface ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {photo ? (
        <img src={photo} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailedSrc(photo)} />
      ) : (
        <>
          {stripes.map((background, index) => (
            <span key={index} className="flex-1 transition-colors duration-500" style={{ background }} />
          ))}
          {size >= 28 && (
            <span
              className={`absolute inset-0 m-auto grid place-items-center rounded-full leading-none ${stripes.length ? "bg-white" : ""}`}
              style={{ width: disc, height: disc, fontSize: Math.round(size * (stripes.length ? 0.36 : 0.5)) }}
            >
              {group.emoji}
            </span>
          )}
        </>
      )}
    </span>
  );
}
