import { useId, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Link } from "react-router";
import { ChevronRightIcon } from "./icons";
import { Switch } from "./Switch";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** A titled block of settings with an optional note under it. */
export function SettingsSection({
  title,
  footnote,
  children,
  className = "",
}: {
  title?: string;
  footnote?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={title ? headingId : undefined} className={`flex flex-col ${className}`}>
      {title && (
        <h2 id={headingId} className="px-2 pb-2 text-[0.9375rem] font-semibold text-sub">
          {title}
        </h2>
      )}
      {children}
      {footnote && <p className="px-2 pt-2 text-[0.8125rem] leading-snug text-sub">{footnote}</p>}
    </section>
  );
}

/** Rows on one grey panel, divided by hairlines. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] bg-surface">{children}</div>;
}

function RowText({ label, description, labelId, descriptionId }: { label: ReactNode; description?: ReactNode; labelId?: string; descriptionId?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-px text-left">
      <span id={labelId} className="text-base">
        {label}
      </span>
      {description && (
        <span id={descriptionId} className="text-[0.8125rem] leading-snug text-sub">
          {description}
        </span>
      )}
    </span>
  );
}

const rowClasses = "flex min-h-14 items-center gap-3.5 py-2.5 pr-3 pl-4 active:bg-line/70";

/** A row that opens another screen. */
export function SettingsLink({
  to,
  label,
  description,
  value,
  icon: RowIcon,
  leading,
}: {
  to: string;
  label: ReactNode;
  description?: ReactNode;
  /** The current choice, shown on the right. */
  value?: ReactNode;
  icon?: Icon;
  /** Instead of an icon, e.g. a group badge or an avatar. */
  leading?: ReactNode;
}) {
  return (
    <Link to={to} className={`${rowClasses} transition hover:bg-line/50`}>
      {RowIcon && <RowIcon className="size-[1.375rem] shrink-0" />}
      {leading}
      <RowText label={label} description={description} />
      {value !== undefined && <span className="max-w-[45%] shrink-0 truncate text-base text-sub">{value}</span>}
      <ChevronRightIcon className="size-5 shrink-0 text-sub" />
    </Link>
  );
}

/** A row that does something right here (report, clear, sign out). `strong` for the ones with consequences. */
export function SettingsButton({
  label,
  description,
  onClick,
  icon: RowIcon,
  disabled,
  strong = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  onClick: () => void;
  icon?: Icon;
  disabled?: boolean;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${rowClasses} w-full transition hover:bg-line/50 disabled:opacity-40 ${strong ? "font-semibold" : ""}`}
    >
      {RowIcon && <RowIcon className="size-[1.375rem] shrink-0" />}
      <RowText label={label} description={description} />
    </button>
  );
}

/** A setting that's on or off. */
export function SettingsSwitch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <div className={`${rowClasses} pr-1.5`}>
      <RowText label={label} description={description} labelId={labelId} descriptionId={description ? descriptionId : undefined} />
      <Switch
        checked={checked}
        onChange={onChange}
        labelledBy={labelId}
        describedBy={description ? descriptionId : undefined}
        disabled={disabled}
      />
    </div>
  );
}

/** A fact rather than a choice (version, storage used). */
export function SettingsValue({
  label,
  description,
  value,
  icon: RowIcon,
  leading,
  trailing,
}: {
  label: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  icon?: Icon;
  leading?: ReactNode;
  /** A small action on the right, e.g. "Sign out" for one device. */
  trailing?: ReactNode;
}) {
  return (
    <div className={`${rowClasses} ${trailing ? "pr-1.5" : "pr-4"}`}>
      {RowIcon && <RowIcon className="size-[1.375rem] shrink-0" />}
      {leading}
      <RowText label={label} description={description} />
      {value !== undefined && <span className="shrink-0 text-base text-sub">{value}</span>}
      {trailing}
    </div>
  );
}

/** One of a few choices, as rows with a check on the chosen one (e.g. which camera opens first). */
export function SettingsChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** Names the group of choices for screen readers. */
  label: string;
  options: { value: T; label: string; description?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] bg-surface">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`${rowClasses} w-full transition hover:bg-line/50`}
        >
          <RowText label={option.label} description={option.description} />
          <span
            aria-hidden
            className={`grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-200 ${option.value === value ? "bg-accent text-on-accent" : "border-2 border-switch-off"}`}
          >
            {option.value === value && (
              <svg viewBox="0 0 24 24" className="size-4 animate-pop-in" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
