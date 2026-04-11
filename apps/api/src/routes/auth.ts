import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAuthToken, extractBearer, parseAuthToken, type AuthRole } from "../auth.js";
import type { Env } from "../env.js";
import type { Db } from "../db.js";
import { hashPassword, verifyPassword } from "../password.js";

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const RegisterFirstBody = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(6).max(128),
});

const CreateUserBody = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(6).max(128),
  role: z.enum(["admin", "user"]).default("user"),
});

function countUsers(db: Db): number {
  return (db.prepare(`SELECT COUNT(1) AS c FROM app_users`).get() as { c: number }).c;
}

function findUserByName(db: Db, username: string) {
  return db
    .prepare(`SELECT id, username, password_hash, role FROM app_users WHERE LOWER(username) = LOWER(?)`)
    .get(username) as { id: number; username: string; password_hash: string; role: AuthRole } | undefined;
}

function requireAdminFromRequest(db: Db, env: Env, authorization: string | undefined) {
  const token = extractBearer(authorization);
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const payload = parseAuthToken(token, env.AUTH_SECRET);
  if (!payload) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  if (payload.role !== "admin") throw Object.assign(new Error("Forbidden"), { status: 403 });
  return payload;
}

export async function registerAuthRoutes(app: FastifyInstance, opts: { db: Db; env: Env }) {
  const { db, env } = opts;

  app.get("/auth/status", async () => {
    const hasSecret = Boolean(env.AUTH_SECRET?.trim());
    const n = countUsers(db);
    const enabled = hasSecret;
    const can_bootstrap = Boolean(hasSecret && n === 0);
    return { enabled, can_bootstrap, has_db_users: n > 0 };
  });

  app.get("/auth/session", async (req, reply) => {
    if (!env.AUTH_SECRET) return reply.code(503).send({ error: "Authentication is not configured." });
    const token = extractBearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "Unauthorized" });
    const payload = parseAuthToken(token, env.AUTH_SECRET);
    if (!payload) return reply.code(401).send({ error: "Unauthorized" });
    return { username: payload.sub, role: payload.role };
  });

  app.post("/auth/register-first", async (req, reply) => {
    if (!env.AUTH_SECRET) return reply.code(503).send({ error: "AUTH_SECRET must be set." });
    if (countUsers(db) > 0) return reply.code(400).send({ error: "Users already exist" });
    const body = RegisterFirstBody.parse(req.body);
    const ph = hashPassword(body.password);
    db.prepare(`INSERT INTO app_users(username, password_hash, role) VALUES (?,?, 'admin')`).run(body.username, ph);
    const token = createAuthToken(env.AUTH_SECRET, { sub: body.username, role: "admin" });
    return { token, expires_in: 7 * 24 * 60 * 60, username: body.username, role: "admin" as const };
  });

  app.post("/auth/login", async (req, reply) => {
    if (!env.AUTH_SECRET) {
      return reply.code(503).send({ error: "Authentication is not configured on the server." });
    }
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body" });
    }
    const { username, password } = parsed.data;
    const n = countUsers(db);

    if (n > 0) {
      const row = findUserByName(db, username);
      if (!row || !verifyPassword(password, row.password_hash)) {
        return reply.code(401).send({ error: "Invalid username or password" });
      }
      const token = createAuthToken(env.AUTH_SECRET, { sub: row.username, role: row.role });
      return { token, expires_in: 7 * 24 * 60 * 60, username: row.username, role: row.role };
    }

    if (!env.AUTH_USER || !env.AUTH_PASS) {
      return reply.code(503).send({ error: "No users in database yet. Create the first admin via /auth/register-first." });
    }
    if (username !== env.AUTH_USER || password !== env.AUTH_PASS) {
      return reply.code(401).send({ error: "Invalid username or password" });
    }
    const token = createAuthToken(env.AUTH_SECRET, { sub: env.AUTH_USER, role: "admin" });
    return { token, expires_in: 7 * 24 * 60 * 60, username: env.AUTH_USER, role: "admin" as const };
  });

  app.get("/auth/users", async (req, reply) => {
    try {
      requireAdminFromRequest(db, env, req.headers.authorization);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      return reply.code(err.status ?? 500).send({ error: err.message ?? "Error" });
    }
    const rows = db.prepare(`SELECT id, username, role, created_at FROM app_users ORDER BY username ASC`).all();
    return { data: rows };
  });

  app.post("/auth/users", async (req, reply) => {
    try {
      requireAdminFromRequest(db, env, req.headers.authorization);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      return reply.code(err.status ?? 500).send({ error: err.message ?? "Error" });
    }
    const body = CreateUserBody.parse(req.body);
    if (findUserByName(db, body.username)) {
      return reply.code(400).send({ error: "Username already exists" });
    }
    const ph = hashPassword(body.password);
    try {
      db.prepare(`INSERT INTO app_users(username, password_hash, role) VALUES (?,?,?)`).run(body.username, ph, body.role);
    } catch {
      return reply.code(400).send({ error: "Could not create user" });
    }
    const row = findUserByName(db, body.username);
    return { data: row };
  });

  app.delete("/auth/users/:id", async (req, reply) => {
    try {
      requireAdminFromRequest(db, env, req.headers.authorization);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      return reply.code(err.status ?? 500).send({ error: err.message ?? "Error" });
    }
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const admins = (db.prepare(`SELECT COUNT(1) AS c FROM app_users WHERE role = 'admin'`).get() as { c: number }).c;
    const victim = db.prepare(`SELECT id, role FROM app_users WHERE id = ?`).get(id) as { id: number; role: AuthRole } | undefined;
    if (!victim) return reply.code(404).send({ error: "User not found" });
    if (victim.role === "admin" && admins <= 1) {
      return reply.code(400).send({ error: "Cannot delete the last admin" });
    }
    db.prepare(`DELETE FROM app_users WHERE id = ?`).run(id);
    return { data: { success: true } };
  });
}
