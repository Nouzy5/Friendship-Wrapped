import type { ReactNode } from "react";

type StateMessageProps = {
  emoji: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Use "h1" when the message is the whole page (404, crash). */
  headingLevel?: "h1" | "h2";
};

/** Centered message for empty, error and not-found states. */
export function StateMessage({ emoji, title, description, action, headingLevel = "h2" }: StateMessageProps) {
  const Heading = headingLevel;

  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span aria-hidden className="text-5xl">
        {emoji}
      </span>
      <Heading className="mt-4 text-xl font-bold text-ink-50">{title}</Heading>
      {description && <p className="mt-2 max-w-sm text-sm text-ink-400">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
