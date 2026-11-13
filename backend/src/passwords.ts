import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Passwords are never stored. We store a "hash": the result of scrambling the password
// with a random "salt" using scrypt, a function built into Node that is slow on purpose,
// so guessing passwords from a stolen database takes a very long time.
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

/** Turns a password into "scrypt:<salt>:<hash>" for the database. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("base64")}:${key.toString("base64")}`;
}

/** Checks a password against what hashPassword() stored. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [method, salt, hash] = stored.split(":");
  if (method !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  // timingSafeEqual takes the same time whether the first or the last byte differs,
  // so an attacker can't learn anything from how long the check takes.
  return timingSafeEqual(actual, expected);
}

/** A long random string that can't be guessed (for login sessions and invite links). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Login tokens are stored hashed, like passwords. A fast hash (SHA-256) is fine here
 * because the token is already long and random, unlike a password someone chose.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
