import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

const OVER_DISPATCH_ALLOWANCE_KGS = 300;

const CreateDispatchBody = z.object({
  dispatch_date: z.string().min(10),
  dispatch_weight: z.coerce.number().positive(),
  dispatch_pcs: z.coerce.number().int().min(0).optional(),
  bundle_no: z.string().trim().optional(),
  transport: z.string().trim().optional(),
  tally_bill_nos: z.array(z.string().trim().min(1)).optional(),
});

const PatchDispatchBody = z.object({
  dispatch_date: z.string().min(10).optional(),
  dispatch_weight: z.coerce.number().positive().optional(),
  dispatch_pcs: z.coerce.number().int().min(0).optional(),
  bundle_no: z.string().trim().optional().nullable(),
  transport: z.string().trim().optional().nullable(),
});

const AddTallyBillBody = z.object({
  bill_no: z.string().trim().min(1).max(128),
});

export async function registerDispatchRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  function orderTotalKgs(orderId: number): number {
    const row = db
      .prepare(`SELECT COALESCE(SUM(order_kgs), 0) AS t FROM order_line_items WHERE order_id = ?`)
      .get(orderId) as { t: number };
    return row.t;
  }

  function dispatchedSoFarForOrder(orderId: number, excludeDispatchId?: number): number {
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

  function assertDispatchWithinAllowanceForOrder(orderId: number, newTotalDispatch: number) {
    const total = orderTotalKgs(orderId);
    const maxAllowed = total + OVER_DISPATCH_ALLOWANCE_KGS;
    if (newTotalDispatch > maxAllowed + 0.0001) {
      throw new Error(`Dispatch exceeds allowed maximum (${maxAllowed} kg) for this WO`);
    }
  }

  function lineTotalKgs(lineId: number): number {
    const totalKgs = db
      .prepare(`SELECT COALESCE(order_kgs, 0) AS t FROM order_line_items WHERE id = ?`)
      .get(lineId) as { t: number };
    return totalKgs.t;
  }

  function dispatchedSoFar(lineId: number, excludeDispatchId?: number): number {
    if (excludeDispatchId) {
      const row = db
        .prepare(`SELECT COALESCE(SUM(dispatch_weight),0) AS w FROM dispatch_entries WHERE order_line_item_id = ? AND id <> ?`)
        .get(lineId, excludeDispatchId) as { w: number };
      return row.w;
    }
    const row = db
      .prepare(`SELECT COALESCE(SUM(dispatch_weight),0) AS w FROM dispatch_entries WHERE order_line_item_id = ?`)
      .get(lineId) as { w: number };
    return row.w;
  }

  function assertDispatchWithinAllowance(lineId: number, newTotalDispatch: number) {
    const total = lineTotalKgs(lineId);
    const maxAllowed = total + OVER_DISPATCH_ALLOWANCE_KGS;
    if (newTotalDispatch > maxAllowed + 0.0001) {
      throw new Error(`Dispatch exceeds allowed maximum (${maxAllowed} kg) for this line`);
    }
  }

  // Work-order dispatch routes (WO-level). Kept for compatibility with existing UI.
  app.get("/orders/:orderId/dispatch", async (req, reply) => {
    const orderId = Number((req.params as { orderId: string }).orderId);
    if (!Number.isFinite(orderId)) return reply.code(400).send({ error: "Invalid order id" });
    const order = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(orderId);
    if (!order) return reply.code(404).send({ error: "Order not found" });

    const rows = db
      .prepare(
        `SELECT id, dispatch_date, dispatch_weight, dispatch_pcs, bundle_no, transport, created_at
         FROM dispatch_entries WHERE order_id = ? ORDER BY dispatch_date DESC, id DESC`,
      )
      .all(orderId);
    const bills = db
      .prepare(
        `SELECT dispatch_entry_id AS dispatch_id, bill_no
         FROM dispatch_tally_bills
         WHERE dispatch_entry_id IN (SELECT id FROM dispatch_entries WHERE order_id = ?)
         ORDER BY id ASC`,
      )
      .all(orderId) as { dispatch_id: number; bill_no: string }[];
    const map = new Map<number, string[]>();
    for (const b of bills) {
      const arr = map.get(b.dispatch_id) ?? [];
      arr.push(b.bill_no);
      map.set(b.dispatch_id, arr);
    }
    const out = (rows as any[]).map((r) => ({ ...r, tally_bill_nos: map.get(r.id) ?? [] }));
    return { data: out };
  });

  app.post("/orders/:orderId/dispatch", async (req, reply) => {
    const orderId = Number((req.params as { orderId: string }).orderId);
    if (!Number.isFinite(orderId)) return reply.code(400).send({ error: "Invalid order id" });
    const body = CreateDispatchBody.parse(req.body);

    const order = db.prepare(`SELECT id FROM orders WHERE id = ?`).get(orderId) as { id: number } | undefined;
    if (!order) return reply.code(404).send({ error: "Order not found" });

    try {
      const already = dispatchedSoFarForOrder(orderId);
      assertDispatchWithinAllowanceForOrder(orderId, already + body.dispatch_weight);
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Invalid dispatch" });
    }

    // For WO-level dispatch, order_line_item_id is not set.
    const info = db
      .prepare(
        `INSERT INTO dispatch_entries(order_id, order_line_item_id, dispatch_date, dispatch_weight, dispatch_pcs, bundle_no, transport)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        orderId,
        null,
        body.dispatch_date,
        body.dispatch_weight,
        body.dispatch_pcs ?? 0,
        body.bundle_no?.trim() || null,
        body.transport ?? null,
      );

    const dispatchId = Number(info.lastInsertRowid);
    const bills = (body.tally_bill_nos ?? []).map((s) => s.trim()).filter(Boolean);
    if (bills.length) {
      const ins = db.prepare(`INSERT INTO dispatch_tally_bills(dispatch_entry_id, bill_no) VALUES (?,?)`);
      for (const b of bills) ins.run(dispatchId, b);
    }

    const rows = db.prepare(`SELECT * FROM v_orders WHERE order_id = ? ORDER BY id ASC`).all(orderId);
    return { data: rows };
  });

  app.get("/order-lines/:lineId/dispatch", async (req, reply) => {
    const lineId = Number((req.params as { lineId: string }).lineId);
    if (!Number.isFinite(lineId)) return reply.code(400).send({ error: "Invalid line id" });
    const rows = db
      .prepare(
        `SELECT id, dispatch_date, dispatch_weight, dispatch_pcs, bundle_no, transport, created_at
         FROM dispatch_entries WHERE order_line_item_id = ? ORDER BY dispatch_date DESC, id DESC`,
      )
      .all(lineId);
    const bills = db
      .prepare(
        `SELECT dispatch_entry_id AS dispatch_id, bill_no
         FROM dispatch_tally_bills
         WHERE dispatch_entry_id IN (SELECT id FROM dispatch_entries WHERE order_line_item_id = ?)
         ORDER BY id ASC`,
      )
      .all(lineId) as { dispatch_id: number; bill_no: string }[];
    const map = new Map<number, string[]>();
    for (const b of bills) {
      const arr = map.get(b.dispatch_id) ?? [];
      arr.push(b.bill_no);
      map.set(b.dispatch_id, arr);
    }
    const out = (rows as any[]).map((r) => ({ ...r, tally_bill_nos: map.get(r.id) ?? [] }));
    return { data: out };
  });

  app.post("/order-lines/:lineId/dispatch", async (req, reply) => {
    const lineId = Number((req.params as { lineId: string }).lineId);
    if (!Number.isFinite(lineId)) return reply.code(400).send({ error: "Invalid line id" });

    const body = CreateDispatchBody.parse(req.body);

    const lineExists = db.prepare(`SELECT order_id FROM order_line_items WHERE id = ?`).get(lineId) as { order_id: number } | undefined;
    if (!lineExists) return reply.code(404).send({ error: "Line item not found" });

    try {
      const already = dispatchedSoFar(lineId);
      assertDispatchWithinAllowance(lineId, already + body.dispatch_weight);
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Invalid dispatch" });
    }

    const info = db
      .prepare(
        `INSERT INTO dispatch_entries(order_id, order_line_item_id, dispatch_date, dispatch_weight, dispatch_pcs, bundle_no, transport)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        lineExists.order_id,
        lineId,
        body.dispatch_date,
        body.dispatch_weight,
        body.dispatch_pcs ?? 0,
        body.bundle_no?.trim() || null,
        body.transport ?? null,
      );

    const dispatchId = Number(info.lastInsertRowid);
    const bills = (body.tally_bill_nos ?? []).map((s) => s.trim()).filter(Boolean);
    if (bills.length) {
      const ins = db.prepare(`INSERT INTO dispatch_tally_bills(dispatch_entry_id, bill_no) VALUES (?,?)`);
      for (const b of bills) ins.run(dispatchId, b);
    }

    const rows = db.prepare(`SELECT * FROM v_orders WHERE order_id = ? ORDER BY id ASC`).all(lineExists.order_id);
    return { data: rows };
  });

  app.patch("/dispatch/:id", async (req, reply) => {
    const dispatchId = Number((req.params as { id: string }).id);
    if (!Number.isFinite(dispatchId)) return reply.code(400).send({ error: "Invalid id" });

    const body = PatchDispatchBody.parse(req.body);
    if (Object.keys(body).length === 0) return reply.code(400).send({ error: "No fields" });

    const existing = db
      .prepare(`SELECT id, order_line_item_id, order_id, dispatch_weight FROM dispatch_entries WHERE id = ?`)
      .get(dispatchId) as { id: number; order_line_item_id: number | null; order_id: number; dispatch_weight: number } | undefined;
    if (!existing) return reply.code(404).send({ error: "Dispatch entry not found" });

    const nextWeight = body.dispatch_weight ?? existing.dispatch_weight;
    try {
      if (existing.order_line_item_id) {
        const alreadyExcludingThis = dispatchedSoFar(existing.order_line_item_id, dispatchId);
        assertDispatchWithinAllowance(existing.order_line_item_id, alreadyExcludingThis + nextWeight);
      } else {
        const alreadyExcludingThis = dispatchedSoFarForOrder(existing.order_id, dispatchId);
        assertDispatchWithinAllowanceForOrder(existing.order_id, alreadyExcludingThis + nextWeight);
      }
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

  app.post("/dispatch/:id/tally-bills", async (req, reply) => {
    const dispatchId = Number((req.params as { id: string }).id);
    if (!Number.isFinite(dispatchId)) return reply.code(400).send({ error: "Invalid id" });
    const body = AddTallyBillBody.parse(req.body);
    const existing = db.prepare(`SELECT id, order_id FROM dispatch_entries WHERE id = ?`).get(dispatchId) as
      | { id: number; order_id: number }
      | undefined;
    if (!existing) return reply.code(404).send({ error: "Dispatch entry not found" });
    db.prepare(`INSERT INTO dispatch_tally_bills(dispatch_entry_id, bill_no) VALUES (?,?)`).run(dispatchId, body.bill_no);
    return { data: { success: true } };
  });

  app.delete("/dispatch/:dispatchId/tally-bills/:billId", async (req, reply) => {
    const dispatchId = Number((req.params as { dispatchId: string }).dispatchId);
    const billId = Number((req.params as { billId: string }).billId);
    if (!Number.isFinite(dispatchId) || !Number.isFinite(billId)) return reply.code(400).send({ error: "Invalid id" });
    const existing = db.prepare(`SELECT id FROM dispatch_entries WHERE id = ?`).get(dispatchId);
    if (!existing) return reply.code(404).send({ error: "Dispatch entry not found" });
    db.prepare(`DELETE FROM dispatch_tally_bills WHERE id = ? AND dispatch_entry_id = ?`).run(billId, dispatchId);
    return { data: { success: true } };
  });
}

