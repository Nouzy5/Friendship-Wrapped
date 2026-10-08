import { useId } from "react";
import { TextField } from "../../../components/ui/TextField";

export const PRESET_EMOJIS = ["🍻", "🎉", "🏖️", "🏔️", "✈️", "🎮", "⚽", "🎸", "🍕", "🔥", "💛", "🌴", "🎓", "🏠", "🐶", "🎄", "🚗", "📸"];

type EmojiPickerProps = {
  value: string;
  onChange: (emoji: string) => void;
  error?: string;
};

/** Preset emoji as real radio buttons (keyboard + screen reader friendly), plus a free-text fallback. */
export function EmojiPicker({ value, onChange, error }: EmojiPickerProps) {
  const name = useId();
  const isCustom = !PRESET_EMOJIS.includes(value);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium text-sub">Emoji</legend>

      <div className="grid grid-cols-6 gap-2">
        {PRESET_EMOJIS.map((emoji) => (
          <label
            key={emoji}
            className="grid aspect-square cursor-pointer place-items-center rounded-2xl bg-(--field-bg,var(--surface)) text-2xl transition select-none hover:bg-line has-checked:bg-line has-checked:ring-2 has-checked:ring-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-fg"
          >
            <input
              type="radio"
              name={name}
              value={emoji}
              checked={value === emoji}
              onChange={() => onChange(emoji)}
              className="sr-only"
            />
            {emoji}
          </label>
        ))}
      </div>

      <TextField
        label="Or type any emoji"
        value={isCustom ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={16}
        placeholder="🙂"
        autoComplete="off"
        error={error}
      />
    </fieldset>
  );
}
