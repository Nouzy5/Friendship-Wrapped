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
      <legend className="mb-1.5 text-sm font-medium text-ink-200">Emoji</legend>

      <div className="grid grid-cols-6 gap-2">
        {PRESET_EMOJIS.map((emoji) => (
          <label
            key={emoji}
            className="grid aspect-square cursor-pointer place-items-center rounded-2xl bg-ink-800 text-2xl transition select-none hover:bg-ink-700 has-checked:bg-ink-700 has-checked:ring-2 has-checked:ring-brand-orange has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-orange"
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
        // The server allows 16 code points; maxLength counts UTF-16 units, two per emoji part.
        maxLength={32}
        placeholder="🙂"
        autoComplete="off"
        error={error}
      />
    </fieldset>
  );
}
