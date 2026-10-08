type SegmentedControlProps<T extends string> = {
  /** Names the group of options for screen readers. */
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of mutually exclusive options, e.g. the tabs of a page. The white marker slides to the chosen one. */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));

  return (
    <div role="group" aria-label={label} className="relative flex rounded-full bg-surface p-[3px]">
      <span
        aria-hidden
        className="absolute inset-y-[3px] left-[3px] rounded-full bg-raised shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative min-h-11 flex-1 rounded-full px-3 text-[0.9375rem] transition-colors duration-200 ${
            option.value === value ? "font-semibold text-fg" : "font-medium text-sub hover:text-fg"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
