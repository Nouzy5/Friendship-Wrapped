import { emailSchema, usernameSchema } from "../users/users.schemas.js";

/** The account a login (or a password reset) names, by email address or by username; null when it can't be anyone's. */
export function credentialLookup(identifier: string): { email: string } | { username: string } | null {
  if (identifier.includes("@")) {
    const email = emailSchema.safeParse(identifier);
    return email.success ? { email: email.data } : null;
  }
  // Only a name that could have been registered can match an account. MySQL's collation
  // ignores accents, so "álice" would find "alice", and each such spelling would get its
  // own allowance of attempts from the rate limiter. Anything else is an unknown user.
  const username = usernameSchema.safeParse(identifier);
  return username.success ? { username: username.data } : null;
}
