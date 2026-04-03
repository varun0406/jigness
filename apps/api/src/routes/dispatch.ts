import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

const CreateDispatchBody = z.object({
  dispatch_date: z.string().min(10),
  dispatch_weight: z.coerce.number().positive(),
  transport: z.string().trim().optional(),
});

export async function registerDispatchRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

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

    const totalKgs = db
      .prepare(`SELECT COALESCE(SUM(order_kgs),0) AS t FROM order_line_items WHERE order_id = ?`)
      .get(id) as { t: number };

    const already = db
      .prepare(`SELECT COALESCE(SUM(dispatch_weight),0) AS w FROM dispatch_entries WHERE order_id = ?`)
      .get(id) as { w: number };

    if (already.w + body.dispatch_weight > totalKgs.t + 0.0001) {
      return reply.code(400).send({ error: "Dispatch exceeds remaining balance" });
    }

    db.prepare(
      `INSERT INTO dispatch_entries(order_id, dispatch_date, dispatch_weight, transport) VALUES (?,?,?,?)`,
    ).run(id, body.dispatch_date, body.dispatch_weight, body.transport ?? null);

    const rows = db.prepare(`SELECT * FROM v_orders WHERE order_id = ? ORDER BY id ASC`).all(id);
    return { data: rows };
  });
}

