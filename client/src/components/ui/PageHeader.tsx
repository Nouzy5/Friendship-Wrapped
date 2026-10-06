import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeftIcon } from "./icons";

type PageHeaderProps = {
  /** Omit when the page renders its own <h1> (e.g. a hero). */
  title?: string;
  backTo?: string;
  /** Instead of `backTo`, e.g. to step back in history and land where the person was. */
  onBack?: () => void;
  backLabel?: string;
  /** Optional control on the right, e.g. an icon link. */
  action?: ReactNode;
};

const backClasses =
  "-ml-2 grid size-10 place-items-center rounded-full text-ink-200 transition hover:bg-ink-800 hover:text-ink-50";

export function PageHeader({ title, backTo, onBack, backLabel = "Back", action }: PageHeaderProps) {
  return (
    <div className="flex min-h-12 items-center gap-1">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label={backLabel} className={backClasses}>
          <ChevronLeftIcon className="size-5" />
        </button>
      ) : (
        backTo && (
          <Link to={backTo} aria-label={backLabel} className={backClasses}>
            <ChevronLeftIcon className="size-5" />
          </Link>
        )
      )}
      {title ? <h1 className="flex-1 text-2xl font-bold tracking-tight">{title}</h1> : <div className="flex-1" />}
      {action}
    </div>
  );
}

const headerIconShape = "grid size-10 place-items-center rounded-full transition hover:bg-ink-800";

/** Round icon button or link for page headers. */
export const headerIconClasses = `${headerIconShape} text-ink-200 hover:text-ink-50`;

/** The same, switched on (e.g. a favorited star). */
export const headerIconActiveClasses = `${headerIconShape} text-brand-gold`;

/** A single header icon, pulled to the edge so its glyph lines up with the content (settings, etc.). */
export const headerIconLinkClasses = `-mr-2 ${headerIconClasses}`;
