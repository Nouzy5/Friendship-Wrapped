import { z } from "zod";

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
