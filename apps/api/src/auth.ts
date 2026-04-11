import crypto from "node:crypto";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthRole = "admin" | "user";

export type AuthTokenPayload = {
  exp: number;
  sub: string;
  role: AuthRole;
};

export function createAuthToken(secret: string, payload: { sub: string; role: AuthRole }): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body: AuthTokenPayload = { exp, sub: payload.sub, role: payload.role };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

/** Returns payload if valid; null otherwise. */
export function parseAuthToken(token: string, secret: string): AuthTokenPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString()) as Partial<AuthTokenPayload>;
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    if (typeof data.sub !== "string" || !data.sub) return null;
    const role = data.role === "admin" || data.role === "user" ? data.role : null;
    if (!role) return null;
    return { exp: data.exp, sub: data.sub, role };
  } catch {
    return null;
  }
}

export function extractBearer(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const t = authorization.slice(7).trim();
  return t.length ? t : null;
}
