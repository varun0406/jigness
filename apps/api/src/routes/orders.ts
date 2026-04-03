import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

const ListOrdersQuery = z.object({
  q: z.string().optional(),
  status: z.enum(["All", "Pending", "Partial", "Paid", "NoInvoice"]).default("All"),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

const PatchOrderBody = z.object({
  invoice_no: z.string().trim().min(1).optional().nullable(),
  invoice_total: z.number().min(0).optional(),
  paid_amount: z.number().min(0).optional(),
});

const PatchLineBody = z.object({
  bill_rate: z.number().min(0).optional(),
  avg_cost: z.number().min(0).optional(),
});

const OrderLine = z.object({
  size: z.string().trim().min(1),
  item: z.string().trim().min(1),
  grade: z.string().trim().min(1),
  length_nos: z.string().trim().optional(),
  order_kgs: z.coerce.number().min(0),
  bill_rate: z.coerce.number().min(0).default(0),
  // avg_cost is derived automatically from purchases; can still be edited later per-line.
  avg_cost: z.coerce.number().min(0).optional(),
});

const CreateOrderBody = z.object({
  wo_no: z.string().trim().min(1),
  order_date: z.string().min(10),
  client_name: z.string().trim().min(1),
  lines: z.array(OrderLine).min(1),
});

function resolveProductId(db: Db, size: string, item: string, grade: string) {
  const existing = db
    .prepare(`SELECT id FROM products WHERE size = ? AND item = ? AND grade = ?`)
    .get(size, item, grade) as { id: number } | undefined;
  if (existing) return existing.id;
  return Number(db.prepare(`INSERT INTO products(size,item,grade) VALUES (?,?,?)`).run(size, item, grade).lastInsertRowid);
}

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

function buildListSql(params: z.infer<typeof ListOrdersQuery>) {
  const where: string[] = [];
  const binds: Record<string, unknown> = {};

  if (params.q) {
    where.push(
      `(wo_no LIKE @like OR client_name LIKE @like OR invoice_no LIKE @like OR or_no LIKE @like OR item LIKE @like)`,
    );
    binds.like = `%${params.q}%`;
  }

  if (params.status !== "All") {
    where.push(`payment_status = @status`);
    binds.status = params.status;
  }

  if (params.from) {
    where.push(`order_date >= @from`);
    binds.from = params.from;
  }
  if (params.to) {
    where.push(`order_date <= @to`);
    binds.to = params.to;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
SELECT *
FROM v_orders
${whereSql}
ORDER BY order_date DESC, order_id DESC, id DESC
LIMIT @limit OFFSET @offset
`;

  return { sql, binds };
}

export async function registerOrdersRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/orders", async (req) => {
    const params = ListOrdersQuery.parse(req.query);
    const { sql, binds } = buildListSql(params);
    const rows = db.prepare(sql).all({ ...binds, limit: params.limit, offset: params.offset });
    return { data: rows, meta: { limit: params.limit, offset: params.offset } };
  });

  app.post("/orders", async (req, reply) => {
    const body = CreateOrderBody.parse(req.body);

    const clientId = (() => {
      const existing = db.prepare(`SELECT id FROM clients WHERE name = ?`).get(body.client_name) as
        | { id: number }
        | undefined;
      if (existing) return existing.id;
      return Number(db.prepare(`INSERT INTO clients(name) VALUES (?)`).run(body.client_name).lastInsertRowid);
    })();

    const lines = body.lines.map((l) => ({
      ...l,
      productId: resolveProductId(db, l.size, l.item, l.grade),
    }));

    const totalKgs = lines.reduce((s, l) => s + l.order_kgs, 0);
    const first = lines[0]!;

    try {
      const orderInfo = db
        .prepare(
          `INSERT INTO orders(wo_no, order_date, client_id, product_id, length_nos, order_kgs, avg_cost, bill_rate)
           VALUES (?,?,?,?,?,?,0,0)`,
        )
        .run(
          body.wo_no,
          body.order_date,
          clientId,
          first.productId,
          first.length_nos ?? null,
          totalKgs,
        );

      const orderId = Number(orderInfo.lastInsertRowid);
      const insLine = db.prepare(
        `INSERT INTO order_line_items(order_id, size, item, grade, length_nos, order_kgs, bill_rate, avg_cost)
         VALUES (?,?,?,?,?,?,?,?)`,
      );
      for (const l of lines) {
        const autoAvg = avgCostFromPurchases(db, l.productId);
        insLine.run(
          orderId,
          l.size,
          l.item,
          l.grade,
          l.length_nos ?? null,
          l.order_kgs,
          l.bill_rate,
          l.avg_cost ?? autoAvg,
        );
      }

      const rows = db.prepare(`SELECT * FROM v_orders WHERE order_id = ? ORDER BY id ASC`).all(orderId);
      return { data: rows };
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Failed to create order" });
    }
  });

  /** Invoice / payment fields on the work order (header) */
  app.patch("/orders/:orderId", async (req, reply) => {
    const orderId = Number((req.params as { orderId: string }).orderId);
    if (!Number.isFinite(orderId)) return reply.code(400).send({ error: "Invalid order id" });

    const body = PatchOrderBody.parse(req.body);
    if (Object.keys(body).length === 0) return reply.code(400).send({ error: "No fields" });

    const fields: string[] = [];
    const binds: Record<string, unknown> = { id: orderId };
    for (const [k, v] of Object.entries(body)) {
      fields.push(`${k} = @${k}`);
      binds[k] = v;
    }

    db.prepare(`UPDATE orders SET ${fields.join(", ")} WHERE id = @id`).run(binds);
    const rows = db.prepare(`SELECT * FROM v_orders WHERE order_id = ? ORDER BY id ASC`).all(orderId);
    return { data: rows };
  });

  /** AVE / BILL RATE per line item */
  app.patch("/order-lines/:lineId", async (req, reply) => {
    const lineId = Number((req.params as { lineId: string }).lineId);
    if (!Number.isFinite(lineId)) return reply.code(400).send({ error: "Invalid line id" });

    const body = PatchLineBody.parse(req.body);
    if (Object.keys(body).length === 0) return reply.code(400).send({ error: "No fields" });

    const fields: string[] = [];
    const binds: Record<string, unknown> = { id: lineId };
    for (const [k, v] of Object.entries(body)) {
      fields.push(`${k} = @${k}`);
      binds[k] = v;
    }

    db.prepare(`UPDATE order_line_items SET ${fields.join(", ")} WHERE id = @id`).run(binds);
    const row = db.prepare(`SELECT * FROM v_orders WHERE id = ?`).get(lineId);
    return { data: row };
  });
}
