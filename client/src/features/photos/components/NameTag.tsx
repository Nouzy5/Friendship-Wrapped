import type { ReactNode } from "react";
import { memberStyle, type MemberColor } from "../../../lib/member-colors";

/** Who posted a photo, as a pill in their colour laid over its corner. */
export function NameTag({ name, color, children, small = false }: { name: string; color: MemberColor | null; children?: ReactNode; small?: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-semibold ${small ? "h-6 px-2.5 text-xs" : "h-[2.125rem] px-3.5 text-[0.9375rem]"}`}
      style={memberStyle(color)}
    >
      <span className="truncate">{name}</span>
      {children && <span className="shrink-0 font-normal">{children}</span>}
    </span>
  );
}
