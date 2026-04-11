import crypto from "node:crypto";

const ITERATIONS = 210_000;
const KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, "sha256").toString("hex");
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = Number(parts[1]);
  const salt = parts[2];
  const expectedHex = parts[3];
  if (!Number.isFinite(iter) || iter < 1000 || !salt || !expectedHex) return false;
  try {
    const test = crypto.pbkdf2Sync(password, salt, iter, KEYLEN, "sha256").toString("hex");
    if (test.length !== expectedHex.length) return false;
    return crypto.timingSafeEqual(Buffer.from(test, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false;
  }
}
