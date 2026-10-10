import { appUrl } from "../../config/env.js";
import { renderEmail } from "../../lib/mail-layout.js";
import type { MailMessage } from "../../lib/mail.js";

/** The page in the web app that confirms an address, given the token from the link. */
export function verifyEmailUrl(token: string): string {
  return `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

/** The page in the web app where a new password is chosen, given the token from the link. */
export function resetPasswordUrl(token: string): string {
  return `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Where someone goes to see their signed-in devices and sign the others out. */
export const securityUrl = () => `${appUrl}/settings/account`;

const timeFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" });

/** "Saturday 10 October 2026 at 14:03 UTC": the server doesn't know the person's zone. */
export const formatWhen = (at: Date) => `${timeFormat.format(at).replace(/,? at /, " at ")} UTC`;

/** Says nothing about who signed up: it goes to whatever address was typed in, which may not be theirs. */
export function verifyEmailMessage(input: { to: string; url: string; validForHours: number }): MailMessage {
  const content = renderEmail({
    preheader: "One tap to confirm your email address.",
    heading: "Confirm your email",
    paragraphs: [
      "Someone signed up for Friendship Wrapped with this email address. If that was you, confirm it to start using your account.",
      `The link works for ${input.validForHours} hours.`,
    ],
    button: { label: "Confirm my email", url: input.url },
    footnote: "If you didn't create a Friendship Wrapped account, you can ignore this email and nothing will happen.",
  });
  return { to: input.to, subject: "Confirm your email for Friendship Wrapped", ...content };
}

export function newSignInMessage(input: { to: string; name: string; device: string; at: Date }): MailMessage {
  const content = renderEmail({
    preheader: `${input.device}, ${formatWhen(input.at)}`,
    heading: "New sign-in to your account",
    paragraphs: [
      `Hi ${input.name}, someone just signed in to your Friendship Wrapped account from a device we haven't seen before.`,
      `Device: ${input.device}`,
      `Time: ${formatWhen(input.at)}`,
      "If that was you, there's nothing to do. If it wasn't, change your password and sign out of every other device right away.",
    ],
    button: { label: "Review my devices", url: securityUrl() },
    footnote: "You get this email the first time you sign in on a new phone or browser.",
  });
  return { to: input.to, subject: "New sign-in to your Friendship Wrapped account", ...content };
}

/**
 * The link to choose a new password. Says nothing about whose account it is: anyone can ask for it
 * with a username, and it goes to the address on that account, which may not be the asker's.
 */
export function passwordResetMessage(input: { to: string; url: string; validForMinutes: number }): MailMessage {
  const validFor = input.validForMinutes % 60 === 0
    ? `${input.validForMinutes / 60} ${input.validForMinutes === 60 ? "hour" : "hours"}`
    : `${input.validForMinutes} minutes`;
  const content = renderEmail({
    preheader: "Choose a new password for your account.",
    heading: "Reset your password",
    paragraphs: [
      "Someone asked to reset the password of the Friendship Wrapped account that uses this email address. If that was you, choose a new password.",
      `The link works for ${validFor}, and only once. Choosing a new password signs you out of every device.`,
    ],
    button: { label: "Choose a new password", url: input.url },
    footnote: "If you didn't ask for this, you can ignore this email. Your password stays the same.",
  });
  return { to: input.to, subject: "Reset your Friendship Wrapped password", ...content };
}

/** Sent after a reset, in case it wasn't the owner who did it. */
export function passwordChangedMessage(input: { to: string; name: string; at: Date }): MailMessage {
  const content = renderEmail({
    preheader: `Changed ${formatWhen(input.at)}.`,
    heading: "Your password was changed",
    paragraphs: [
      `Hi ${input.name}, the password of your Friendship Wrapped account was reset on ${formatWhen(input.at)}, and every device was signed out.`,
      "If that was you, there's nothing to do. If it wasn't, someone can read this mailbox: reset your password again, then secure your email account too.",
    ],
    button: { label: "Log in", url: `${appUrl}/auth/login` },
  });
  return { to: input.to, subject: "Your Friendship Wrapped password was changed", ...content };
}

/** Sent to the address that is being replaced, in case someone else is changing it. */
export function emailChangedMessage(input: { to: string; name: string; newEmail: string; at: Date }): MailMessage {
  const content = renderEmail({
    preheader: "The email address on your account was changed.",
    heading: "Your email address was changed",
    paragraphs: [
      `Hi ${input.name}, the email address on your Friendship Wrapped account was changed to ${input.newEmail} on ${formatWhen(input.at)}.`,
      "If that was you, there's nothing to do. If it wasn't, sign in and change your password right away.",
    ],
    button: { label: "Go to my account", url: securityUrl() },
  });
  return { to: input.to, subject: "Your Friendship Wrapped email address was changed", ...content };
}

/** Sent from the admin panel, to check that email works. */
export function testMessage(input: { to: string }): MailMessage {
  const content = renderEmail({
    preheader: "Email from Friendship Wrapped is working.",
    heading: "Email is working",
    paragraphs: ["This is a test email from the Friendship Wrapped admin panel. If you can read it, verification and sign-in emails will reach people."],
  });
  return { to: input.to, subject: "Test email from Friendship Wrapped", ...content };
}
