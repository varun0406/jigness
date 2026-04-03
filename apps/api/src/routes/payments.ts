import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

const CreatePaymentBody = z.object({
  payment_date: z.string().min(10),
  amount: z.coerce.number().positive(),
  note: z.string().trim().optional(),
});

function recomputePaidAmount(db: Db, orderId: number) {
  const sum = db
    .prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE order_id = ?`)
    .get(orderId) as { s: number };
  db.prepare(`UPDATE orders SET paid_amount = ? WHERE id = ?`).run(sum.s, orderId);
}

export async function registerPaymentsRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/orders/:id/payments", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const rows = db
      .prepare(
        `SELECT id, payment_date, amount, note, created_at
         FROM payments WHERE order_id = ? ORDER BY payment_date DESC, id DESC`,
      )
      .all(id);
    return { data: rows };
  });

  app.post("/orders/:id/payments", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });

    const body = CreatePaymentBody.parse(req.body);
    const order = db.prepare(`SELECT id, invoice_total FROM orders WHERE id = ?`).get(id) as
      | { id: number; invoice_total: number }
      | undefined;
    if (!order) return reply.code(404).send({ error: "Order not found" });

    if (order.invoice_total <= 0) {
      return reply.code(400).send({ error: "Invoice total must be set before adding payments" });
    }

    db.prepare(`INSERT INTO payments(order_id, payment_date, amount, note) VALUES (?,?,?,?)`).run(
      id,
      body.payment_date,
      body.amount,
      body.note ?? null,
    );

    recomputePaidAmount(db, id);
    const rows = db.prepare(`SELECT * FROM v_orders WHERE order_id = ? ORDER BY id ASC`).all(id);
    return { data: rows };
  });
}

