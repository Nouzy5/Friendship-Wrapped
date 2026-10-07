export type SignOutReason = "logout" | "account-deleted";

let reason: SignOutReason | null = null;

/**
 * Notes that the session is ending on purpose, just before it's cleared. The auth guard
 * then sends you to the login page without remembering the page you were on (it's for
 * the next person, or for you starting fresh), and the login page can say what happened.
 */
export function markSignedOut(why: SignOutReason): void {
  reason = why;
}

/** Why the session ended, if it was on purpose (null after an expired session). */
export function signOutReason(): SignOutReason | null {
  return reason;
}

/** Once the login page has shown it. */
export function clearSignOutReason(): void {
  reason = null;
}
