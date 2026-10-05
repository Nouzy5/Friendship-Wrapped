import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

type ScryptParams = { N: number; r: number; p: number };

// OWASP-recommended scrypt parameters: N=2^15, r=8, p=3 (~32 MiB per hash).
// Params are stored with each hash, so they can be raised later without breaking old hashes.
const PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function deriveKey(password: string, salt: Buffer, { N, r, p }: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Runs on the libuv thread pool, so hashing doesn't block the event loop.
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Returns a self-describing hash: `scrypt$N$r$p$<salt b64>$<key b64>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  const [algorithm, n, r, p, saltB64, keyB64] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltB64 || !keyB64) return false;

  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every(Number.isSafeInteger)) return false;

  const expected = Buffer.from(keyB64, "base64");
  const actual = await deriveKey(password, Buffer.from(saltB64, "base64"), params);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same CPU time as a real verification and always returns false.
 * Used when a username doesn't exist, so response timing doesn't reveal which usernames are taken.
 */
export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(await dummyHash, password);
  return false;
}
