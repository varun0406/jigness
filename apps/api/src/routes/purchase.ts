import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";

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
    if (currentSum.s + body.weight_received > po.weight + 0.0001) {
      return reply.code(400).send({ error: "Received total cannot exceed PO weight" });
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
    const body = z
      .object({
        rec_note: z.string().trim().optional().nullable(),
      })
      .parse(req.body);
    db.prepare(`UPDATE purchase_entries SET rec_note = ? WHERE id = ?`).run(body.rec_note ?? null, id);
    const row = ledgerRow(db, id);
    if (!row) return reply.code(404).send({ error: "Not found" });
    return { data: row };
  });
}
