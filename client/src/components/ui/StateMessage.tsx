import type { ReactNode } from "react";

type StateMessageProps = {
  emoji: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

/** Centered message for empty, error and not-found states. */
export function StateMessage({ emoji, title, description, action }: StateMessageProps) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span aria-hidden className="text-5xl">
        {emoji}
      </span>
      <h1 className="mt-4 text-xl font-bold text-ink-50">{title}</h1>
      {description && <p className="mt-2 max-w-sm text-sm text-ink-400">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
