import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

const OVER_DISPATCH_ALLOWANCE_KGS = 300;

const CreateDispatchBody = z.object({
  dispatch_date: z.string().min(10),
  dispatch_weight: z.coerce.number().positive(),
  transport: z.string().trim().optional(),
});

const PatchDispatchBody = z.object({
  dispatch_date: z.string().min(10).optional(),
  dispatch_weight: z.coerce.number().positive().optional(),
  transport: z.string().trim().optional().nullable(),
});

export async function registerDispatchRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  function orderTotalKgs(orderId: number): number {
    const totalKgs = db
      .prepare(`SELECT COALESCE(SUM(order_kgs),0) AS t FROM order_line_items WHERE order_id = ?`)
      .get(orderId) as { t: number };
    return totalKgs.t;
  }

  function dispatchedSoFar(orderId: number, excludeDispatchId?: number): number {
    if (excludeDispatchId) {
      const row = db
        .prepare(`SELECT COALESCE(SUM(dispatch_weight),0) AS w FROM dispatch_entries WHERE order_id = ? AND id <> ?`)
        .get(orderId, excludeDispatchId) as { w: number };
      return row.w;
    }
    const row = db
      .prepare(`SELECT COALESCE(SUM(dispatch_weight),0) AS w FROM dispatch_entries WHERE order_id = ?`)
      .get(orderId) as { w: number };
    return row.w;
  }

  function assertDispatchWithinAllowance(orderId: number, newTotalDispatch: number) {
    const total = orderTotalKgs(orderId);
    const maxAllowed = total + OVER_DISPATCH_ALLOWANCE_KGS;
    if (newTotalDispatch > maxAllowed + 0.0001) {
      throw new Error(`Dispatch exceeds allowed maximum (${maxAllowed} kg) for this order`);
    }
  }

  app.get("/orders/:id/dispatch", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const rows = db
      .prepare(
        `SELECT id, dispatch_date, dispatch_weight, transport, created_at
         FROM dispatch_entries WHERE order_id = ? ORDER BY dispatch_date DESC, id DESC`,
      )
      .all(id);
    return { data: rows };
  });

  app.post("/orders/:id/dispatch", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });

    const body = CreateDispatchBody.parse(req.body);

    const orderExists = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(id) as { id: number } | undefined;
    if (!orderExists) return reply.code(404).send({ error: "Order not found" });

    try {
      const already = dispatchedSoFar(id);
      assertDispatchWithinAllowance(id, already + body.dispatch_weight);
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Invalid dispatch" });
    }

    db.prepare(
      `INSERT INTO dispatch_entries(order_id, dispatch_date, dispatch_weight, transport) VALUES (?,?,?,?)`,
    ).run(id, body.dispatch_date, body.dispatch_weight, body.transport ?? null);

    const rows = db.prepare(`SELECT * FROM v_orders WHERE order_id = ? ORDER BY id ASC`).all(id);
    return { data: rows };
  });

  app.patch("/dispatch/:id", async (req, reply) => {
    const dispatchId = Number((req.params as { id: string }).id);
    if (!Number.isFinite(dispatchId)) return reply.code(400).send({ error: "Invalid id" });

    const body = PatchDispatchBody.parse(req.body);
    if (Object.keys(body).length === 0) return reply.code(400).send({ error: "No fields" });

    const existing = db
      .prepare(`SELECT id, order_id, dispatch_weight FROM dispatch_entries WHERE id = ?`)
      .get(dispatchId) as { id: number; order_id: number; dispatch_weight: number } | undefined;
    if (!existing) return reply.code(404).send({ error: "Dispatch entry not found" });

    const nextWeight = body.dispatch_weight ?? existing.dispatch_weight;
    try {
      const alreadyExcludingThis = dispatchedSoFar(existing.order_id, dispatchId);
      assertDispatchWithinAllowance(existing.order_id, alreadyExcludingThis + nextWeight);
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Invalid dispatch" });
    }

    const fields: string[] = [];
    const binds: Record<string, unknown> = { id: dispatchId };
    for (const [k, v] of Object.entries(body)) {
      fields.push(`${k} = @${k}`);
      binds[k] = v;
    }
    db.prepare(`UPDATE dispatch_entries SET ${fields.join(", ")} WHERE id = @id`).run(binds);

    const rows = db.prepare(`SELECT * FROM v_orders WHERE order_id = ? ORDER BY id ASC`).all(existing.order_id);
    return { data: rows };
  });

  app.delete("/dispatch/:id", async (req, reply) => {
    const dispatchId = Number((req.params as { id: string }).id);
    if (!Number.isFinite(dispatchId)) return reply.code(400).send({ error: "Invalid id" });

    const existing = db
      .prepare(`SELECT id, order_id FROM dispatch_entries WHERE id = ?`)
      .get(dispatchId) as { id: number; order_id: number } | undefined;
    if (!existing) return reply.code(404).send({ error: "Dispatch entry not found" });

    db.prepare(`DELETE FROM dispatch_entries WHERE id = ?`).run(dispatchId);
    const rows = db.prepare(`SELECT * FROM v_orders WHERE order_id = ? ORDER BY id ASC`).all(existing.order_id);
    return { data: rows };
  });
}

