type SegmentedControlProps<T extends string> = {
  /** Names the group of options for screen readers. */
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** A row of mutually exclusive options, e.g. the tabs of a page. */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full border border-ink-700 bg-ink-900/60 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`min-h-9 flex-1 rounded-full px-3 text-sm font-semibold transition ${
            option.value === value ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
