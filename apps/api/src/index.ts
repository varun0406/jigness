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

const db = openDb(env.DB_PATH);
migrate(db);
// Keep database empty by default (no seed data).

app.get("/health", async () => ({ ok: true }));

await registerDashboardRoutes(app, { db });
await registerOrdersRoutes(app, { db });
await registerDispatchRoutes(app, { db });
await registerPurchaseRoutes(app, { db });
await registerPaymentsRoutes(app, { db });
await registerMastersRoutes(app, { db });
await registerInventoryRoutes(app, { db });

await app.listen({ port: env.PORT, host: env.HOST });

