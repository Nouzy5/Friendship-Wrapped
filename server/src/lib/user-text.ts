import { z } from "zod";

/**
 * A name on one line: no control characters or line separators, and none of the invisible
 * direction overrides (U+202A to U+202E, U+2066 to U+2069) that can make a name display backwards.
 */
export const SINGLE_LINE_NAME_PATTERN = /^[^\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]+$/u;

/** Characters that are letters or symbols by category but show as nothing. */
const BLANK_LOOKING = /[\u115F\u1160\u3164\uFFA0\u2800]/gu;

/**
 * True when the text has something you can see (a letter, number, symbol or punctuation),
 * so a name made only of spaces, zero-width or filler characters doesn't look empty.
 */
export function hasVisibleCharacter(value: string): boolean {
  return /[\p{L}\p{N}\p{S}\p{P}]/u.test(value.replace(BLANK_LOOKING, ""));
}

/**
 * Free text someone typed, such as a caption or comment. Line breaks are normalised and
 * kept, surrounding whitespace is trimmed, and other control characters are rejected.
 * `noun` names it in messages: "Captions can be at most 500 characters".
 */
export function multilineTextSchema(maxLength: number, noun: string) {
  return z
    .string()
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .max(maxLength, `${noun}s can be at most ${maxLength} characters`)
        .regex(/^(?:[^\p{Cc}]|\n)*$/u, `${noun} contains invalid characters`),
    );
}
