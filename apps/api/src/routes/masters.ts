import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

const UpsertClientBody = z.object({ name: z.string().trim().min(1) });
const UpsertSupplierBody = z.object({ name: z.string().trim().min(1) });
const UpsertProductBody = z.object({
  size: z.string().trim().min(1),
  item: z.string().trim().min(1),
  grade: z.string().trim().min(1),
});

function avgCostFromPurchases(db: Db, productId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(
        (SELECT SUM(pr.weight_received * pe.rate) / NULLIF(SUM(pr.weight_received), 0)
         FROM purchase_receipts pr
         JOIN purchase_entries pe ON pe.id = pr.purchase_entry_id
         WHERE pe.product_id = ?),
        0
      ) AS avg_cost`,
    )
    .get(productId) as { avg_cost: number };
  return row.avg_cost;
}

export async function registerMastersRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/masters/clients", async () => {
    const rows = db.prepare(`SELECT id, name FROM clients ORDER BY name ASC LIMIT 1000`).all();
    return { data: rows };
  });
  app.post("/masters/clients", async (req) => {
    const body = UpsertClientBody.parse(req.body);
    const existing = db.prepare(`SELECT id, name FROM clients WHERE name = ?`).get(body.name) as
      | { id: number; name: string }
      | undefined;
    if (existing) return { data: existing };
    const id = Number(db.prepare(`INSERT INTO clients(name) VALUES (?)`).run(body.name).lastInsertRowid);
    return { data: { id, name: body.name } };
  });

  app.get("/masters/suppliers", async () => {
    const rows = db.prepare(`SELECT id, name FROM suppliers ORDER BY name ASC LIMIT 1000`).all();
    return { data: rows };
  });
  app.post("/masters/suppliers", async (req) => {
    const body = UpsertSupplierBody.parse(req.body);
    const existing = db.prepare(`SELECT id, name FROM suppliers WHERE name = ?`).get(body.name) as
      | { id: number; name: string }
      | undefined;
    if (existing) return { data: existing };
    const id = Number(db.prepare(`INSERT INTO suppliers(name) VALUES (?)`).run(body.name).lastInsertRowid);
    return { data: { id, name: body.name } };
  });

  app.get("/masters/products", async () => {
    const rows = db
      .prepare(`
        SELECT
          p.id,
          p.size,
          p.item,
          p.grade,
          /* Weighted avg cost from purchases: Σ(receipt kg × PO rate) / Σ(receipt kg) */
          COALESCE(
            (
              SELECT SUM(pr.weight_received * pe.rate) / NULLIF(SUM(pr.weight_received), 0)
              FROM purchase_receipts pr
              JOIN purchase_entries pe ON pe.id = pr.purchase_entry_id
              WHERE pe.product_id = p.id
            ),
            0
          ) AS avg_cost
        FROM products p
        ORDER BY p.item ASC, p.size ASC, p.grade ASC
        LIMIT 2000
      `)
      .all();
    return { data: rows };
  });
  app.post("/masters/products", async (req) => {
    const body = UpsertProductBody.parse(req.body);
    const existing = db
      .prepare(`SELECT id, size, item, grade FROM products WHERE size = ? AND item = ? AND grade = ?`)
      .get(body.size, body.item, body.grade) as { id: number; size: string; item: string; grade: string } | undefined;
    if (existing) return { data: { ...existing, avg_cost: avgCostFromPurchases(db, existing.id) } };
    const id = Number(
      db
        .prepare(`INSERT INTO products(size,item,grade) VALUES (?,?,?)`)
        .run(body.size, body.item, body.grade).lastInsertRowid,
    );
    return { data: { id, ...body, avg_cost: 0 } };
  });
}

