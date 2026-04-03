import crypto from "node:crypto";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createAuthToken(secret: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyAuthToken(token: string, secret: string): boolean {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    if (typeof data.exp !== "number" || Date.now() > data.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function extractBearer(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const t = authorization.slice(7).trim();
  return t.length ? t : null;
}
