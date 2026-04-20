import type { Db } from "./db.js";

export function migrate(db: Db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  size TEXT NOT NULL,
  item TEXT NOT NULL,
  grade TEXT NOT NULL,
  UNIQUE(size, item, grade)
);

-- Core lifecycle row (WO)
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  wo_no TEXT NOT NULL UNIQUE,
  order_date TEXT NOT NULL, -- ISO yyyy-mm-dd
  client_id INTEGER NOT NULL REFERENCES clients(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  length_nos TEXT,
  order_kgs REAL NOT NULL CHECK(order_kgs >= 0),

  -- Sales/Order reference (optional)
  or_no TEXT,
  sales_date TEXT,
  weight_sold REAL DEFAULT 0 CHECK(weight_sold >= 0),
  sales_return REAL DEFAULT 0 CHECK(sales_return >= 0),

  -- Billing
  avg_cost REAL DEFAULT 0 CHECK(avg_cost >= 0),
  bill_rate REAL DEFAULT 0 CHECK(bill_rate >= 0),

  -- Invoice / payment summary fields (derived by app logic, kept denormalized for speed)
  invoice_no TEXT,
  invoice_total REAL DEFAULT 0 CHECK(invoice_total >= 0),
  paid_amount REAL DEFAULT 0 CHECK(paid_amount >= 0),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS orders_updated_at
AFTER UPDATE ON orders
BEGIN
  UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS dispatch_entries (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_line_item_id INTEGER REFERENCES order_line_items(id) ON DELETE CASCADE,
  dispatch_date TEXT NOT NULL,
  dispatch_weight REAL NOT NULL CHECK(dispatch_weight > 0),
  transport TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dispatch_tally_bills (
  id INTEGER PRIMARY KEY,
  dispatch_entry_id INTEGER NOT NULL REFERENCES dispatch_entries(id) ON DELETE CASCADE,
  bill_no TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_entries (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  product_id INTEGER REFERENCES products(id),
  po_no TEXT,
  purchase_date TEXT NOT NULL,
  weight REAL NOT NULL CHECK(weight > 0),
  rate REAL NOT NULL CHECK(rate >= 0),
  received_weight REAL DEFAULT 0 CHECK(received_weight >= 0),
  debit_note TEXT,
  rec_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Goods received against a raw-material PO (multiple lines per PO)
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id INTEGER PRIMARY KEY,
  purchase_entry_id INTEGER NOT NULL REFERENCES purchase_entries(id) ON DELETE CASCADE,
  receipt_date TEXT NOT NULL,
  weight_received REAL NOT NULL CHECK(weight_received > 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Line items: one WO can have many products; AVE / BILL RATE per line
CREATE TABLE IF NOT EXISTS order_line_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  item TEXT NOT NULL,
  grade TEXT NOT NULL,
  length_nos TEXT,
  order_kgs REAL NOT NULL CHECK(order_kgs >= 0),
  bill_rate REAL DEFAULT 0 CHECK(bill_rate >= 0),
  avg_cost REAL DEFAULT 0 CHECK(avg_cost >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
  migrateOrderLines(db);
  migratePurchaseSchema(db);
  migrateDispatchSchema(db);
  migrateAppSettings(db);
  migrateAppUsers(db);
}

function migrateAppUsers(db: Db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS app_users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
}

function migrateAppSettings(db: Db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_real REAL NOT NULL DEFAULT 0
);
`);
  db.exec(`INSERT OR IGNORE INTO app_settings(key, value_real) VALUES ('opening_stock_kgs', 0);`);
  db.exec(`INSERT OR IGNORE INTO app_settings(key, value_real) VALUES ('minimum_stock_kgs', 0);`);

  db.exec(`
CREATE TABLE IF NOT EXISTS sales_returns (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  return_date TEXT NOT NULL,
  weight REAL NOT NULL CHECK(weight > 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY,
  purchase_entry_id INTEGER NOT NULL REFERENCES purchase_entries(id) ON DELETE CASCADE,
  return_date TEXT NOT NULL,
  weight REAL NOT NULL CHECK(weight > 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
}

function migrateOrderLines(db: Db) {
  const lineCount = (db.prepare(`SELECT COUNT(1) AS c FROM order_line_items`).get() as { c: number }).c;
  const orderCount = (db.prepare(`SELECT COUNT(1) AS c FROM orders`).get() as { c: number }).c;
  if (lineCount === 0 && orderCount > 0) {
    db.exec(`
INSERT INTO order_line_items (order_id, size, item, grade, length_nos, order_kgs, bill_rate, avg_cost)
SELECT o.id, p.size, p.item, p.grade, o.length_nos, o.order_kgs, o.bill_rate, o.avg_cost
FROM orders o
JOIN products p ON p.id = o.product_id;
`);
  }

  db.exec(`
UPDATE orders SET order_kgs = (
  SELECT COALESCE(SUM(oli.order_kgs), 0) FROM order_line_items oli WHERE oli.order_id = orders.id
) WHERE EXISTS (SELECT 1 FROM order_line_items o2 WHERE o2.order_id = orders.id);
`);

  db.exec(`DROP VIEW IF EXISTS v_orders;`);
  db.exec(`
CREATE VIEW v_orders AS
SELECT
  oli.id AS id,
  o.id AS order_id,
  o.wo_no,
  o.order_date,
  c.name AS client_name,
  oli.size,
  oli.item,
  oli.grade,
  oli.length_nos,
  oli.order_kgs,
  COALESCE((SELECT SUM(de.dispatch_weight) FROM dispatch_entries de WHERE de.order_line_item_id = oli.id), 0) AS dispatch_weight,
  (
    oli.order_kgs
    - COALESCE((SELECT SUM(de.dispatch_weight) FROM dispatch_entries de WHERE de.order_line_item_id = oli.id), 0)
  ) AS balance_kgs,
  oli.avg_cost,
  oli.bill_rate,
  (oli.bill_rate - oli.avg_cost) AS profit_per_kg,
  o.or_no,
  o.sales_date,
  o.weight_sold,
  o.sales_return,
  o.invoice_no,
  o.invoice_total,
  o.paid_amount,
  (o.invoice_total - o.paid_amount) AS baki_amount,
  CASE
    WHEN o.invoice_total <= 0 THEN 'NoInvoice'
    WHEN o.paid_amount >= o.invoice_total THEN 'Paid'
    WHEN o.paid_amount > 0 THEN 'Partial'
    ELSE 'Pending'
  END AS payment_status
FROM order_line_items oli
JOIN orders o ON o.id = oli.order_id
JOIN clients c ON c.id = o.client_id
`);
}

function columnExists(db: Db, table: string, name: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === name);
}

/** Add columns / tables for existing SQLite files created before PO receipts. */
function migratePurchaseSchema(db: Db) {
  if (!columnExists(db, "purchase_entries", "product_id")) {
    db.exec(`ALTER TABLE purchase_entries ADD COLUMN product_id INTEGER REFERENCES products(id)`);
  }
  if (!columnExists(db, "purchase_entries", "debit_note")) {
    db.exec(`ALTER TABLE purchase_entries ADD COLUMN debit_note TEXT`);
  }
  if (!columnExists(db, "purchase_entries", "rec_note")) {
    db.exec(`ALTER TABLE purchase_entries ADD COLUMN rec_note TEXT`);
  }
  db.exec(`
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id INTEGER PRIMARY KEY,
  purchase_entry_id INTEGER NOT NULL REFERENCES purchase_entries(id) ON DELETE CASCADE,
  receipt_date TEXT NOT NULL,
  weight_received REAL NOT NULL CHECK(weight_received > 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
  // One-time: move old manual received_weight into receipt lines so totals stay consistent
  db.exec(`
INSERT INTO purchase_receipts (purchase_entry_id, receipt_date, weight_received, note)
SELECT id, purchase_date, received_weight, 'Imported from legacy'
FROM purchase_entries
WHERE received_weight > 0
AND NOT EXISTS (SELECT 1 FROM purchase_receipts r WHERE r.purchase_entry_id = purchase_entries.id);
`);
  db.exec(`
UPDATE purchase_entries SET received_weight = (
  SELECT COALESCE(SUM(weight_received), 0) FROM purchase_receipts pr WHERE pr.purchase_entry_id = purchase_entries.id
) WHERE EXISTS (SELECT 1 FROM purchase_receipts r2 WHERE r2.purchase_entry_id = purchase_entries.id);
`);
}

function migrateDispatchSchema(db: Db) {
  if (!columnExists(db, "dispatch_entries", "order_line_item_id")) {
    db.exec(`ALTER TABLE dispatch_entries ADD COLUMN order_line_item_id INTEGER REFERENCES order_line_items(id) ON DELETE CASCADE`);
    db.exec(`
      UPDATE dispatch_entries 
      SET order_line_item_id = (
        SELECT id FROM order_line_items WHERE order_line_items.order_id = dispatch_entries.order_id LIMIT 1
      )
      WHERE order_line_item_id IS NULL;
    `);
  }

  db.exec(`
CREATE TABLE IF NOT EXISTS dispatch_tally_bills (
  id INTEGER PRIMARY KEY,
  dispatch_entry_id INTEGER NOT NULL REFERENCES dispatch_entries(id) ON DELETE CASCADE,
  bill_no TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
}

export function seed(db: Db) {
  const orderCount = db.prepare(`SELECT COUNT(1) as c FROM orders`).get() as { c: number };
  if (orderCount.c > 0) return;

  const insClient = db.prepare(`INSERT INTO clients(name) VALUES (?)`);
  const insSupplier = db.prepare(`INSERT INTO suppliers(name) VALUES (?)`);
  const insProduct = db.prepare(`INSERT INTO products(size,item,grade) VALUES (?,?,?)`);
  const insOrder = db.prepare(`
    INSERT INTO orders(
      wo_no, order_date, client_id, product_id, length_nos, order_kgs,
      or_no, sales_date, weight_sold, sales_return,
      avg_cost, bill_rate,
      invoice_no, invoice_total, paid_amount
    ) VALUES (
      @wo_no, @order_date, @client_id, @product_id, @length_nos, @order_kgs,
      @or_no, @sales_date, @weight_sold, @sales_return,
      @avg_cost, @bill_rate,
      @invoice_no, @invoice_total, @paid_amount
    )
  `);
  
  const clientA = Number(insClient.run("Shree Metals").lastInsertRowid);
  const clientB = Number(insClient.run("Kiran Industries").lastInsertRowid);
  insSupplier.run("Om Suppliers");
  insSupplier.run("Vishal Traders");

  const prod1 = Number(insProduct.run("8mm", "Copper Rod", "ETP").lastInsertRowid);
  const prod2 = Number(insProduct.run("50x50", "Copper Section", "DHP").lastInsertRowid);

  const o1 = Number(
    insOrder.run({
      wo_no: "WO-1001",
      order_date: "2026-04-01",
      client_id: clientA,
      product_id: prod1,
      length_nos: "Nos: 25",
      order_kgs: 1200,
      or_no: "OR-501",
      sales_date: "2026-04-02",
      weight_sold: 900,
      sales_return: 0,
      avg_cost: 720,
      bill_rate: 760,
      invoice_no: "INV-9001",
      invoice_total: 684000,
      paid_amount: 500000,
    }).lastInsertRowid,
  );

  const o2 = Number(
    insOrder.run({
      wo_no: "WO-1002",
      order_date: "2026-04-02",
      client_id: clientB,
      product_id: prod2,
      length_nos: "Length: 12ft",
      order_kgs: 800,
      or_no: "OR-502",
      sales_date: "2026-04-02",
      weight_sold: 800,
      sales_return: 50,
      avg_cost: 690,
      bill_rate: 670,
      invoice_no: "INV-9002",
      invoice_total: 536000,
      paid_amount: 0,
    }).lastInsertRowid,
  );

  const insLine = db.prepare(
    `INSERT INTO order_line_items(order_id, size, item, grade, length_nos, order_kgs, bill_rate, avg_cost) VALUES (?,?,?,?,?,?,?,?)`,
  );
  const lineO1 = Number(insLine.run(o1, "8mm", "Copper Rod", "ETP", "Nos: 25", 1200, 760, 720).lastInsertRowid);
  const lineO2 = Number(insLine.run(o2, "50x50", "Copper Section", "DHP", "Length: 12ft", 800, 670, 690).lastInsertRowid);

  const insDispatch = db.prepare(
    `INSERT INTO dispatch_entries(order_id, order_line_item_id, dispatch_date, dispatch_weight, transport) VALUES (?,?,?,?,?)`,
  );
  insDispatch.run(o1, lineO1, "2026-04-01", 400, "Truck");
  insDispatch.run(o1, lineO1, "2026-04-02", 500, "Tempo");
  insDispatch.run(o2, lineO2, "2026-04-02", 750, "Truck");
}

