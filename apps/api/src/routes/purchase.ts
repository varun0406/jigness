import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

/** Total receipts may exceed PO ordered weight by this much (same idea as dispatch over-delivery). */
const RECEIPT_VARIANCE_ALLOWANCE_KGS = 300;

function maxReceivableForPo(poWeight: number): number {
  return poWeight + RECEIPT_VARIANCE_ALLOWANCE_KGS;
}

const CreatePurchaseBody = z.object({
  supplier_name: z.string().trim().min(1),
  po_no: z.string().trim().optional(),
  purchase_date: z.string().min(10),
  weight: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  debit_note: z.string().trim().optional(),
  size: z.string().trim().min(1),
  item: z.string().trim().min(1),
  grade: z.string().trim().min(1),
});

const CreatePurchaseBatchBody = z.object({
  supplier_name: z.string().trim().min(1),
  po_no: z.string().trim().optional(),
  purchase_date: z.string().min(10),
  lines: z
    .array(
      z.object({
        weight: z.coerce.number().positive(),
        rate: z.coerce.number().min(0),
        debit_note: z.string().trim().optional(),
        size: z.string().trim().min(1),
        item: z.string().trim().min(1),
        grade: z.string().trim().min(1),
      }),
    )
    .min(1),
});

function resolveProductId(db: Db, size: string, item: string, grade: string) {
  const existing = db
    .prepare(`SELECT id FROM products WHERE size = ? AND item = ? AND grade = ?`)
    .get(size, item, grade) as { id: number } | undefined;
  if (existing) return existing.id;
  return Number(db.prepare(`INSERT INTO products(size,item,grade) VALUES (?,?,?)`).run(size, item, grade).lastInsertRowid);
}

const CreateReceiptBody = z.object({
  receipt_date: z.string().min(10),
  weight_received: z.coerce.number().positive(),
  note: z.string().trim().optional(),
});

const PatchPurchaseBody = z.object({
  supplier_name: z.string().trim().min(1).optional(),
  po_no: z.string().trim().optional().nullable(),
  purchase_date: z.string().min(10).optional(),
  weight: z.coerce.number().positive().optional(),
  rate: z.coerce.number().min(0).optional(),
  debit_note: z.string().trim().optional().nullable(),
  size: z.string().trim().min(1).optional(),
  item: z.string().trim().min(1).optional(),
  grade: z.string().trim().min(1).optional(),
  rec_note: z.string().trim().optional().nullable(),
});

const PatchReceiptBody = z.object({
  receipt_date: z.string().min(10).optional(),
  weight_received: z.coerce.number().positive().optional(),
  note: z.string().trim().optional().nullable(),
});

function ledgerRow(db: Db, id: number) {
  return db
    .prepare(
      `SELECT
         pe.id,
         pe.po_no,
         pe.purchase_date,
         pe.weight,
         pe.received_weight,
         (pe.weight - pe.received_weight) AS balance_weight,
         pe.rate,
         (pe.weight * pe.rate) AS amount_ordered,
         (pe.received_weight * pe.rate) AS amount_received,
         pe.debit_note,
         pe.rec_note,
         s.name AS supplier_name,
         pr.size AS size,
         pr.item AS item,
         pr.grade AS grade
       FROM purchase_entries pe
       JOIN suppliers s ON s.id = pe.supplier_id
       LEFT JOIN products pr ON pr.id = pe.product_id
       WHERE pe.id = ?`,
    )
    .get(id) as Record<string, unknown>;
}

function recalcReceived(db: Db, purchaseEntryId: number) {
  const row = db
    .prepare(`SELECT COALESCE(SUM(weight_received),0) AS s FROM purchase_receipts WHERE purchase_entry_id = ?`)
    .get(purchaseEntryId) as { s: number };
  db.prepare(`UPDATE purchase_entries SET received_weight = ? WHERE id = ?`).run(row.s, purchaseEntryId);
}

function resolveSupplierId(db: Db, name: string) {
  const existing = db.prepare(`SELECT id FROM suppliers WHERE name = ?`).get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  return Number(db.prepare(`INSERT INTO suppliers(name) VALUES (?)`).run(name).lastInsertRowid);
}

export async function registerPurchaseRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/purchase-ledger", async () => {
    const rows = db
      .prepare(
        `
SELECT
  pe.id,
  pe.po_no,
  pe.purchase_date,
  pe.weight,
  pe.received_weight,
  (pe.weight - pe.received_weight) AS balance_weight,
  pe.rate,
  (pe.weight * pe.rate) AS amount_ordered,
  (pe.received_weight * pe.rate) AS amount_received,
  pe.debit_note,
  pe.rec_note,
  s.name AS supplier_name,
  pr.size AS size,
  pr.item AS item,
  pr.grade AS grade
FROM purchase_entries pe
JOIN suppliers s ON s.id = pe.supplier_id
LEFT JOIN products pr ON pr.id = pe.product_id
ORDER BY pe.purchase_date DESC, pe.id DESC
LIMIT 500
`,
      )
      .all();
    return { data: rows };
  });

  app.get("/purchase/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const row = ledgerRow(db, id);
    if (!row) return reply.code(404).send({ error: "Not found" });
    return { data: row };
  });

  app.get("/purchase/:id/receipts", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const rows = db
      .prepare(
        `SELECT id, receipt_date, weight_received, note, created_at
         FROM purchase_receipts WHERE purchase_entry_id = ? ORDER BY receipt_date DESC, id DESC`,
      )
      .all(id);
    return { data: rows };
  });

  app.post("/purchase", async (req) => {
    const body = CreatePurchaseBody.parse(req.body);

    const supplierId = (() => {
      const existing = db.prepare(`SELECT id FROM suppliers WHERE name = ?`).get(body.supplier_name) as
        | { id: number }
        | undefined;
      if (existing) return existing.id;
      return Number(db.prepare(`INSERT INTO suppliers(name) VALUES (?)`).run(body.supplier_name).lastInsertRowid);
    })();

    const productId = resolveProductId(db, body.size, body.item, body.grade);

    const info = db
      .prepare(
        `INSERT INTO purchase_entries(supplier_id, product_id, po_no, purchase_date, weight, rate, received_weight, debit_note)
         VALUES (?,?,?,?,?,?,0,?)`,
      )
      .run(supplierId, productId, body.po_no ?? null, body.purchase_date, body.weight, body.rate, body.debit_note ?? null);

    const id = Number(info.lastInsertRowid);
    return { data: ledgerRow(db, id) };
  });

  /** Create many PO lines atomically under same header (robust against partial failures). */
  app.post("/purchase/batch", async (req, reply) => {
    const body = CreatePurchaseBatchBody.parse(req.body);

    try {
      const created = db.transaction(() => {
        const supplierId = resolveSupplierId(db, body.supplier_name);
        const ins = db.prepare(
          `INSERT INTO purchase_entries(supplier_id, product_id, po_no, purchase_date, weight, rate, received_weight, debit_note)
           VALUES (?,?,?,?,?,?,0,?)`,
        );
        const ids: number[] = [];
        for (const l of body.lines) {
          const productId = resolveProductId(db, l.size, l.item, l.grade);
          const info = ins.run(
            supplierId,
            productId,
            body.po_no ?? null,
            body.purchase_date,
            l.weight,
            l.rate,
            l.debit_note ?? null,
          );
          ids.push(Number(info.lastInsertRowid));
        }
        return ids.map((id) => ledgerRow(db, id));
      })();

      return { data: created };
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Failed to create PO" });
    }
  });

  app.post("/purchase/:id/receipt", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });

    const body = CreateReceiptBody.parse(req.body);
    const po = db.prepare(`SELECT id, weight, received_weight FROM purchase_entries WHERE id = ?`).get(id) as
      | { id: number; weight: number; received_weight: number }
      | undefined;
    if (!po) return reply.code(404).send({ error: "Purchase order not found" });

    const currentSum = db
      .prepare(`SELECT COALESCE(SUM(weight_received),0) AS s FROM purchase_receipts WHERE purchase_entry_id = ?`)
      .get(id) as { s: number };
    const cap = maxReceivableForPo(po.weight);
    if (currentSum.s + body.weight_received > cap + 0.0001) {
      return reply.code(400).send({
        error: `Received total cannot exceed PO weight + ${RECEIPT_VARIANCE_ALLOWANCE_KGS} kg (${cap} kg max)`,
      });
    }

    db.prepare(
      `INSERT INTO purchase_receipts(purchase_entry_id, receipt_date, weight_received, note) VALUES (?,?,?,?)`,
    ).run(id, body.receipt_date, body.weight_received, body.note ?? null);

    recalcReceived(db, id);
    return { data: ledgerRow(db, id) };
  });

  app.patch("/purchase/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const body = PatchPurchaseBody.parse(req.body);
    if (Object.keys(body).length === 0) return reply.code(400).send({ error: "No fields" });

    const existing = db
      .prepare(`SELECT id, supplier_id, product_id, weight, received_weight FROM purchase_entries WHERE id = ?`)
      .get(id) as { id: number; supplier_id: number; product_id: number | null; weight: number; received_weight: number } | undefined;
    if (!existing) return reply.code(404).send({ error: "Not found" });

    const nextWeight = body.weight ?? existing.weight;
    const minPoWeight = Math.max(0, existing.received_weight - RECEIPT_VARIANCE_ALLOWANCE_KGS);
    if (nextWeight < minPoWeight - 0.0001) {
      return reply.code(400).send({
        error: `PO weight cannot be below (received − ${RECEIPT_VARIANCE_ALLOWANCE_KGS} kg); minimum for this PO is ${minPoWeight} kg`,
      });
    }

    let nextSupplierId: number | undefined;
    if (body.supplier_name !== undefined) {
      nextSupplierId = resolveSupplierId(db, body.supplier_name);
    }

    let nextProductId: number | null | undefined;
    if (body.size !== undefined || body.item !== undefined || body.grade !== undefined) {
      const currentProd = db
        .prepare(`SELECT size, item, grade FROM products WHERE id = ?`)
        .get(existing.product_id) as { size: string; item: string; grade: string } | undefined;
      const size = body.size ?? currentProd?.size;
      const item = body.item ?? currentProd?.item;
      const grade = body.grade ?? currentProd?.grade;
      if (!size || !item || !grade) {
        return reply.code(400).send({ error: "Size, item, and grade are required for product" });
      }
      nextProductId = resolveProductId(db, size, item, grade);
    }

    const fields: string[] = [];
    const binds: Record<string, unknown> = { id };
    if (nextSupplierId !== undefined) {
      fields.push(`supplier_id = @supplier_id`);
      binds.supplier_id = nextSupplierId;
    }
    if (nextProductId !== undefined) {
      fields.push(`product_id = @product_id`);
      binds.product_id = nextProductId;
    }
    for (const key of ["po_no", "purchase_date", "weight", "rate", "debit_note", "rec_note"] as const) {
      if ((body as any)[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        binds[key] = (body as any)[key] ?? null;
      }
    }

    if (fields.length === 0) return reply.code(400).send({ error: "No fields" });

    db.prepare(`UPDATE purchase_entries SET ${fields.join(", ")} WHERE id = @id`).run(binds);
    const row = ledgerRow(db, id);
    return { data: row };
  });

  app.patch("/purchase-receipts/:id", async (req, reply) => {
    const receiptId = Number((req.params as { id: string }).id);
    if (!Number.isFinite(receiptId)) return reply.code(400).send({ error: "Invalid id" });
    const body = PatchReceiptBody.parse(req.body);
    if (Object.keys(body).length === 0) return reply.code(400).send({ error: "No fields" });

    const existing = db
      .prepare(`SELECT id, purchase_entry_id, weight_received FROM purchase_receipts WHERE id = ?`)
      .get(receiptId) as { id: number; purchase_entry_id: number; weight_received: number } | undefined;
    if (!existing) return reply.code(404).send({ error: "Receipt not found" });

    const po = db.prepare(`SELECT id, weight FROM purchase_entries WHERE id = ?`).get(existing.purchase_entry_id) as
      | { id: number; weight: number }
      | undefined;
    if (!po) return reply.code(404).send({ error: "Purchase order not found" });

    const nextWeight = body.weight_received ?? existing.weight_received;
    const sumOther = db
      .prepare(`SELECT COALESCE(SUM(weight_received),0) AS s FROM purchase_receipts WHERE purchase_entry_id = ? AND id <> ?`)
      .get(existing.purchase_entry_id, receiptId) as { s: number };
    const cap = maxReceivableForPo(po.weight);
    if (sumOther.s + nextWeight > cap + 0.0001) {
      return reply.code(400).send({
        error: `Received total cannot exceed PO weight + ${RECEIPT_VARIANCE_ALLOWANCE_KGS} kg (${cap} kg max)`,
      });
    }

    const fields: string[] = [];
    const binds: Record<string, unknown> = { id: receiptId };
    for (const [k, v] of Object.entries(body)) {
      fields.push(`${k} = @${k}`);
      binds[k] = v ?? null;
    }
    db.prepare(`UPDATE purchase_receipts SET ${fields.join(", ")} WHERE id = @id`).run(binds);
    recalcReceived(db, existing.purchase_entry_id);
    return { data: ledgerRow(db, existing.purchase_entry_id) };
  });

  app.delete("/purchase-receipts/:id", async (req, reply) => {
    const receiptId = Number((req.params as { id: string }).id);
    if (!Number.isFinite(receiptId)) return reply.code(400).send({ error: "Invalid id" });

    const existing = db
      .prepare(`SELECT id, purchase_entry_id FROM purchase_receipts WHERE id = ?`)
      .get(receiptId) as { id: number; purchase_entry_id: number } | undefined;
    if (!existing) return reply.code(404).send({ error: "Receipt not found" });

    db.prepare(`DELETE FROM purchase_receipts WHERE id = ?`).run(receiptId);
    recalcReceived(db, existing.purchase_entry_id);
    return { data: ledgerRow(db, existing.purchase_entry_id) };
  });

  app.delete("/purchase/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });
    const po = db.prepare(`SELECT id FROM purchase_entries WHERE id = ?`).get(id);
    if (!po) return reply.code(404).send({ error: "Purchase order not found" });

    db.prepare(`DELETE FROM purchase_receipts WHERE purchase_entry_id = ?`).run(id);
    db.prepare(`DELETE FROM purchase_entries WHERE id = ?`).run(id);

    return { data: { success: true } };
  });
}
