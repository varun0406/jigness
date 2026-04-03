import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAuthToken } from "../auth.js";
import type { Env } from "../env.js";

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance, env: Env) {
  app.get("/auth/status", async () => ({
    enabled: Boolean(env.AUTH_USER && env.AUTH_SECRET),
  }));

  app.post("/auth/login", async (req, reply) => {
    if (!env.AUTH_USER || !env.AUTH_PASS || !env.AUTH_SECRET) {
      return reply.code(503).send({ error: "Authentication is not configured on the server." });
    }
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body" });
    }
    const { username, password } = parsed.data;
    if (username !== env.AUTH_USER || password !== env.AUTH_PASS) {
      return reply.code(401).send({ error: "Invalid username or password" });
    }
    const token = createAuthToken(env.AUTH_SECRET);
    return { token, expires_in: 7 * 24 * 60 * 60 };
  });
}
