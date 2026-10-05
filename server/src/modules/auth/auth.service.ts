import { AppError } from "../../lib/errors.js";
import { hashPassword, verifyDummyPassword, verifyPassword } from "../../lib/password.js";
import { isUniqueConstraintError } from "../../lib/prisma.js";
import type { PublicUser } from "../users/user.dto.js";
import * as usersRepository from "../users/users.repository.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";
import { issueSession, pruneExpiredSessions, revokeSession, type IssuedSession } from "./session.service.js";

type AuthResult = { user: PublicUser; session: IssuedSession };

export async function register(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  let user: PublicUser;
  try {
    user = await usersRepository.createUser({
      username: input.username,
      displayName: input.displayName,
      passwordHash,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, "USERNAME_TAKEN", "That username is already taken", [
        { path: "username", message: "That username is already taken" },
      ]);
    }
    throw error;
  }

  return { user, session: await issueSession(user.id) };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const credentials = await usersRepository.findUserCredentials(input.username);

  const valid = credentials
    ? await verifyPassword(credentials.passwordHash, input.password)
    : await verifyDummyPassword(input.password);

  if (!credentials || !valid) {
    // Same response for unknown users and wrong passwords.
    throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect username or password");
  }

  const { passwordHash: _passwordHash, ...user } = credentials;
  await pruneExpiredSessions(user.id);

  return { user, session: await issueSession(user.id) };
}

export async function logout(token: string | undefined): Promise<void> {
  if (token) await revokeSession(token);
}
