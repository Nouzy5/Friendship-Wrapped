type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The id of the element that names it (usually the row's label). */
  labelledBy?: string;
  /** Or a name of its own. */
  label?: string;
  describedBy?: string;
  disabled?: boolean;
};

/** An on/off switch. On is your own colour: it's your choice. The knob slides and the track fills. */
export function Switch({ checked, onChange, labelledBy, label, describedBy, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group grid h-11 w-15 shrink-0 place-items-center disabled:opacity-40"
    >
      <span className={`flex h-8 w-13 rounded-full p-0.5 transition-colors duration-200 ${checked ? "bg-accent" : "bg-switch-off"}`}>
        <span
          className={`size-7 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:scale-90 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
