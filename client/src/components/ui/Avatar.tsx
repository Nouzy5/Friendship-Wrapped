import { useState } from "react";
import { memberFill } from "../../lib/member-colors";
import type { MemberColor } from "../../lib/member-colors";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "size-6 text-[0.6875rem]",
  sm: "size-8 text-[0.9375rem]",
  md: "size-10 text-base",
  lg: "size-16 text-[1.75rem]",
  xl: "size-22 text-[2.375rem]",
};

/** The ring around a photo avatar, in the person's colour. */
const ringClasses: Record<AvatarSize, string> = {
  xs: "ring-[1.5px]",
  sm: "ring-2",
  md: "ring-2",
  lg: "ring-3",
  xl: "ring-4",
};

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The first user-perceived character, so an emoji like 👩🏽‍🚀 or 🇸🇰 isn't cut in half. */
function initialOf(name: string): string {
  const first = graphemes.segment(name.trim())[Symbol.iterator]().next().value?.segment;
  return (first ?? "?").toUpperCase();
}

type AvatarProps = {
  name: string;
  /** Profile picture URL; falls back to the initial when missing or broken. */
  src?: string | null;
  /** Their colour in the group on screen. Without one (outside a group, or people who left) it's neutral. */
  color?: MemberColor | null;
  size?: AvatarSize;
  className?: string;
};

/**
 * A person: their initial on their colour, or their photo ringed in it.
 * Decorative: always render the person's name next to it or label its container.
 */
export function Avatar({ name, src, color, size = "md", className = "" }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && src !== failedSrc;
  const fill = memberFill(color);

  return (
    <span
      aria-hidden
      style={
        showImage
          ? { ["--tw-ring-color" as string]: color ? fill.background : "transparent" }
          : { backgroundColor: fill.background, color: fill.ink }
      }
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold transition-colors duration-500 select-none ${sizeClasses[size]} ${
        showImage && color ? `${ringClasses[size]} ring-offset-0` : ""
      } ${className}`}
    >
      {showImage ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}
