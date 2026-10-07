import { useState } from "react";

type AvatarSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-xl",
  xl: "size-24 text-3xl",
};

const gradients = [
  "from-brand-rose to-brand-orange",
  "from-brand-orange to-brand-gold",
  "from-violet-500 to-brand-rose",
  "from-sky-500 to-violet-500",
  "from-emerald-400 to-sky-500",
  "from-brand-gold to-emerald-400",
];

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = Array.from(words[0] ?? "?")[0] ?? "?";
  const last = words.length > 1 ? (Array.from(words.at(-1) ?? "")[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Stable per user, so each friend keeps the same colour everywhere. */
function gradientFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return gradients[hash % gradients.length]!;
}

type AvatarProps = {
  name: string;
  /** Usually the user id. */
  seed: string;
  /** Profile picture URL; falls back to initials when missing or broken. */
  src?: string | null;
  size?: AvatarSize;
};

/** Profile picture or initials. Decorative: always render the person's name next to it or label its container. */
export function Avatar({ name, seed, src, size = "md" }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && src !== failedSrc;

  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-linear-to-br font-bold text-ink-950 select-none ${sizeClasses[size]} ${gradientFor(seed)}`}
    >
      {showImage ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
