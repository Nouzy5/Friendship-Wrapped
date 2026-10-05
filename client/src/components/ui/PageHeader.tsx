import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeftIcon } from "./icons";

type PageHeaderProps = {
  title: string;
  backTo?: string;
  backLabel?: string;
  /** Optional control on the right, e.g. an icon link. */
  action?: ReactNode;
};

export function PageHeader({ title, backTo, backLabel = "Back", action }: PageHeaderProps) {
  return (
    <div className="flex min-h-12 items-center gap-1">
      {backTo && (
        <Link
          to={backTo}
          aria-label={backLabel}
          className="-ml-2 grid size-10 place-items-center rounded-full text-ink-200 transition hover:bg-ink-800 hover:text-ink-50"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
      )}
      <h1 className="flex-1 text-2xl font-bold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}
