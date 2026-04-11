import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./env.js";
import { openDb } from "./db.js";
import { migrate } from "./schema.js";
import { registerOrdersRoutes } from "./routes/orders.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerDispatchRoutes } from "./routes/dispatch.js";
import { registerPurchaseRoutes } from "./routes/purchase.js";
import { registerPaymentsRoutes } from "./routes/payments.js";
import { registerMastersRoutes } from "./routes/masters.js";
import { registerInventoryRoutes } from "./routes/inventory.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { extractBearer, parseAuthToken } from "./auth.js";
import { registerReturnsRoutes } from "./routes/returns.js";

const env = loadEnv(process.env);

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss" },
          },
  },
});

await app.register(cors, { origin: env.CORS_ORIGIN });

function pathnameOnly(url: string): string {
  const q = url.indexOf("?");
  return q >= 0 ? url.slice(0, q) : url;
}

const db = openDb(env.DB_PATH);
migrate(db);

const authEnabled = Boolean(env.AUTH_SECRET?.trim());
if (authEnabled) {
  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "OPTIONS") return;
    const path = pathnameOnly(req.url);
    if (path === "/health") return;
    if (path === "/auth/status" || path === "/auth/login" || path === "/auth/register-first") return;
    const token = extractBearer(req.headers.authorization);
    if (!token || !parseAuthToken(token, env.AUTH_SECRET)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
}

app.get("/health", async () => ({ ok: true }));

await registerAuthRoutes(app, { db, env });

await registerDashboardRoutes(app, { db });
await registerOrdersRoutes(app, { db });
await registerDispatchRoutes(app, { db });
await registerPurchaseRoutes(app, { db });
await registerPaymentsRoutes(app, { db });
await registerMastersRoutes(app, { db });
await registerInventoryRoutes(app, { db });
await registerReturnsRoutes(app, { db });

await app.listen({ port: env.PORT, host: env.HOST });
