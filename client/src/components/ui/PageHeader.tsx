import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeftIcon } from "./icons";

type PageHeaderProps = {
  /** Omit when the page renders its own <h1> (e.g. a hero). */
  title?: string;
  /** A line under the title, e.g. how many members. */
  subtitle?: ReactNode;
  backTo?: string;
  /** Instead of `backTo`, e.g. to step back in history and land where the person was. */
  onBack?: () => void;
  backLabel?: string;
  /** Optional control on the right of the back row, e.g. an icon link. */
  action?: ReactNode;
};

const backClasses = "-ml-3 grid size-11 place-items-center rounded-full text-fg transition hover:bg-surface";

/** A back button row, then a large title, like the screens in the design. */
export function PageHeader({ title, subtitle, backTo, onBack, backLabel = "Back", action }: PageHeaderProps) {
  const back = onBack ? (
    <button type="button" onClick={onBack} aria-label={backLabel} className={backClasses}>
      <ChevronLeftIcon className="size-6" />
    </button>
  ) : (
    backTo && (
      // Marked as going back, so the page slides in from the left (PageTransition).
      <Link to={backTo} state={{ back: true }} aria-label={backLabel} className={backClasses}>
        <ChevronLeftIcon className="size-6" />
      </Link>
    )
  );

  return (
    <div className="flex flex-col gap-1">
      {(back || action) && (
        <div className="flex min-h-11 items-center justify-between">
          {back || <span />}
          {action}
        </div>
      )}
      {title && (
        <h1 className="text-[2rem] leading-tight font-semibold font-stretch-112% wrap-break-word">{title}</h1>
      )}
      {subtitle && <p className="text-sm text-sub">{subtitle}</p>}
    </div>
  );
}

const headerIconShape = "grid size-11 place-items-center rounded-full transition hover:bg-surface";

/** Round icon button or link for page headers. */
export const headerIconClasses = `${headerIconShape} text-fg`;

/** The same, switched on (e.g. a favorited star): filled in your colour. */
export const headerIconActiveClasses = `${headerIconShape} text-accent`;

/** A single header icon, pulled to the edge so its glyph lines up with the content (settings, etc.). */
export const headerIconLinkClasses = `-mr-2.5 ${headerIconClasses}`;
