import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

const PatchOpeningBody = z.object({
  opening_stock_kgs: z.coerce.number().min(0),
});

export function getOpeningStockKgs(db: Db): number {
  const row = db
    .prepare(`SELECT value_real FROM app_settings WHERE key = 'opening_stock_kgs'`)
    .get() as { value_real: number } | undefined;
  return row?.value_real ?? 0;
}

export async function registerInventoryRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/inventory/opening-stock", async () => {
    return { data: { opening_stock_kgs: getOpeningStockKgs(db) } };
  });

  app.patch("/inventory/opening-stock", async (req) => {
    const body = PatchOpeningBody.parse(req.body);
    db.prepare(
      `INSERT INTO app_settings(key, value_real) VALUES ('opening_stock_kgs', @v)
       ON CONFLICT(key) DO UPDATE SET value_real = excluded.value_real`,
    ).run({ v: body.opening_stock_kgs });
    return { data: { opening_stock_kgs: getOpeningStockKgs(db) } };
  });
}
