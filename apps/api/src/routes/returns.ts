import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

const CreateSalesReturn = z.object({
  order_id: z.coerce.number().int().positive(),
  return_date: z.string().min(10),
  weight: z.coerce.number().positive(),
  note: z.string().trim().optional(),
});

const PatchSalesReturn = z.object({
  return_date: z.string().min(10).optional(),
  weight: z.coerce.number().positive().optional(),
  note: z.string().trim().optional().nullable(),
});

const CreatePurchaseReturn = z.object({
  purchase_entry_id: z.coerce.number().int().positive(),
  return_date: z.string().min(10),
  weight: z.coerce.number().positive(),
  note: z.string().trim().optional(),
});

const PatchPurchaseReturn = z.object({
  return_date: z.string().min(10).optional(),
  weight: z.coerce.number().positive().optional(),
  note: z.string().trim().optional().nullable(),
});

function orderDispatchTotal(db: Db, orderId: number): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(dispatch_weight),0) AS w FROM dispatch_entries WHERE order_id = ?`)
    .get(orderId) as { w: number };
  return row.w;
}

function orderSalesReturnTotal(db: Db, orderId: number, excludeReturnId?: number): number {
  if (excludeReturnId) {
    const row = db
      .prepare(`SELECT COALESCE(SUM(weight),0) AS w FROM sales_returns WHERE order_id = ? AND id <> ?`)
      .get(orderId, excludeReturnId) as { w: number };
    return row.w;
  }
  const row = db.prepare(`SELECT COALESCE(SUM(weight),0) AS w FROM sales_returns WHERE order_id = ?`).get(orderId) as {
    w: number;
  };
  return row.w;
}

function poReceiptsTotal(db: Db, purchaseEntryId: number): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(weight_received),0) AS w FROM purchase_receipts WHERE purchase_entry_id = ?`)
    .get(purchaseEntryId) as { w: number };
  return row.w;
}

function poReturnsTotal(db: Db, purchaseEntryId: number, excludeReturnId?: number): number {
  if (excludeReturnId) {
    const row = db
      .prepare(`SELECT COALESCE(SUM(weight),0) AS w FROM purchase_returns WHERE purchase_entry_id = ? AND id <> ?`)
      .get(purchaseEntryId, excludeReturnId) as { w: number };
    return row.w;
  }
  const row = db
    .prepare(`SELECT COALESCE(SUM(weight),0) AS w FROM purchase_returns WHERE purchase_entry_id = ?`)
    .get(purchaseEntryId) as { w: number };
  return row.w;
}

export async function registerReturnsRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/returns/sales", async () => {
    const rows = db
      .prepare(
        `SELECT id, order_id, return_date, weight, note, created_at
         FROM sales_returns
         ORDER BY return_date DESC, id DESC
         LIMIT 500`,
      )
      .all();
    return { data: rows };
  });

  app.post("/returns/sales", async (req, reply) => {
    const body = CreateSalesReturn.parse(req.body);
    const order = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(body.order_id);
    if (!order) return reply.code(404).send({ error: "Order not found" });

    const dispatchTotal = orderDispatchTotal(db, body.order_id);
    const alreadyReturned = orderSalesReturnTotal(db, body.order_id);
    if (alreadyReturned + body.weight > dispatchTotal + 0.0001) {
      return reply.code(400).send({ error: "Sales return total cannot exceed dispatched total" });
    }

    db.prepare(
      `INSERT INTO sales_returns(order_id, return_date, weight, note) VALUES (?,?,?,?)`,
    ).run(body.order_id, body.return_date, body.weight, body.note ?? null);
    return { data: { success: true } };
  });

  app.patch("/returns/sales/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const body = PatchSalesReturn.parse(req.body);
    if (Object.keys(body).length === 0) return reply.code(400).send({ error: "No fields" });

    const existing = db
      .prepare(`SELECT id, order_id, weight FROM sales_returns WHERE id = ?`)
      .get(id) as { id: number; order_id: number; weight: number } | undefined;
    if (!existing) return reply.code(404).send({ error: "Not found" });

    const nextWeight = body.weight ?? existing.weight;
    const dispatchTotal = orderDispatchTotal(db, existing.order_id);
    const alreadyOther = orderSalesReturnTotal(db, existing.order_id, id);
    if (alreadyOther + nextWeight > dispatchTotal + 0.0001) {
      return reply.code(400).send({ error: "Sales return total cannot exceed dispatched total" });
    }

    const fields: string[] = [];
    const binds: Record<string, unknown> = { id };
    for (const [k, v] of Object.entries(body)) {
      fields.push(`${k} = @${k}`);
      binds[k] = v ?? null;
    }
    db.prepare(`UPDATE sales_returns SET ${fields.join(", ")} WHERE id = @id`).run(binds);
    return { data: { success: true } };
  });

  app.delete("/returns/sales/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const existing = db.prepare(`SELECT id FROM sales_returns WHERE id = ?`).get(id);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    db.prepare(`DELETE FROM sales_returns WHERE id = ?`).run(id);
    return { data: { success: true } };
  });

  app.get("/returns/purchase", async () => {
    const rows = db
      .prepare(
        `SELECT id, purchase_entry_id, return_date, weight, note, created_at
         FROM purchase_returns
         ORDER BY return_date DESC, id DESC
         LIMIT 500`,
      )
      .all();
    return { data: rows };
  });

  app.post("/returns/purchase", async (req, reply) => {
    const body = CreatePurchaseReturn.parse(req.body);
    const po = db.prepare(`SELECT id FROM purchase_entries WHERE id = ?`).get(body.purchase_entry_id);
    if (!po) return reply.code(404).send({ error: "Purchase order not found" });

    const receipts = poReceiptsTotal(db, body.purchase_entry_id);
    const alreadyReturned = poReturnsTotal(db, body.purchase_entry_id);
    if (alreadyReturned + body.weight > receipts + 0.0001) {
      return reply.code(400).send({ error: "Purchase return total cannot exceed received receipts total" });
    }

    db.prepare(
      `INSERT INTO purchase_returns(purchase_entry_id, return_date, weight, note) VALUES (?,?,?,?)`,
    ).run(body.purchase_entry_id, body.return_date, body.weight, body.note ?? null);
    return { data: { success: true } };
  });

  app.patch("/returns/purchase/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const body = PatchPurchaseReturn.parse(req.body);
    if (Object.keys(body).length === 0) return reply.code(400).send({ error: "No fields" });

    const existing = db
      .prepare(`SELECT id, purchase_entry_id, weight FROM purchase_returns WHERE id = ?`)
      .get(id) as { id: number; purchase_entry_id: number; weight: number } | undefined;
    if (!existing) return reply.code(404).send({ error: "Not found" });

    const nextWeight = body.weight ?? existing.weight;
    const receipts = poReceiptsTotal(db, existing.purchase_entry_id);
    const alreadyOther = poReturnsTotal(db, existing.purchase_entry_id, id);
    if (alreadyOther + nextWeight > receipts + 0.0001) {
      return reply.code(400).send({ error: "Purchase return total cannot exceed received receipts total" });
    }

    const fields: string[] = [];
    const binds: Record<string, unknown> = { id };
    for (const [k, v] of Object.entries(body)) {
      fields.push(`${k} = @${k}`);
      binds[k] = v ?? null;
    }
    db.prepare(`UPDATE purchase_returns SET ${fields.join(", ")} WHERE id = @id`).run(binds);
    return { data: { success: true } };
  });

  app.delete("/returns/purchase/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const existing = db.prepare(`SELECT id FROM purchase_returns WHERE id = ?`).get(id);
    if (!existing) return reply.code(404).send({ error: "Not found" });
    db.prepare(`DELETE FROM purchase_returns WHERE id = ?`).run(id);
    return { data: { success: true } };
  });
}

