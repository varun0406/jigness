import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { getOpeningStockKgs } from "./inventory.js";

export async function registerDashboardRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/dashboard/summary", async () => {
    const totalOrderKgs = (
      db.prepare(`SELECT COALESCE(SUM(order_kgs),0) AS t FROM order_line_items`).get() as { t: number }
    ).t;

    const totalDispatchKgs = (
      db.prepare(`SELECT COALESCE(SUM(dispatch_weight),0) AS w FROM dispatch_entries`).get() as { w: number }
    ).w;

    const pendingKgsRow = db
      .prepare(
        `
SELECT COALESCE(SUM(CASE WHEN (ol.tot - COALESCE(d.disp, 0)) > 0 THEN (ol.tot - COALESCE(d.disp, 0)) ELSE 0 END), 0) AS p
FROM (
  SELECT order_id, SUM(order_kgs) AS tot FROM order_line_items GROUP BY order_id
) ol
LEFT JOIN (
  SELECT order_id, SUM(dispatch_weight) AS disp FROM dispatch_entries GROUP BY order_id
) d ON d.order_id = ol.order_id
`,
      )
      .get() as { p: number };

    const profitAgg = db
      .prepare(
        `
SELECT
  COALESCE(SUM(CASE WHEN (oli.bill_rate - oli.avg_cost) >= 0 THEN (oli.bill_rate - oli.avg_cost) * oli.order_kgs ELSE 0 END), 0) AS pos,
  COALESCE(SUM(CASE WHEN (oli.bill_rate - oli.avg_cost) < 0 THEN (oli.bill_rate - oli.avg_cost) * oli.order_kgs ELSE 0 END), 0) AS neg
FROM order_line_items oli
`,
      )
      .get() as { pos: number; neg: number };

    const purchaseSum = db.prepare(`SELECT COALESCE(SUM(weight),0) AS w FROM purchase_entries`).get() as {
      w: number;
    };
    const dispatchSum = db
      .prepare(`SELECT COALESCE(SUM(dispatch_weight),0) AS w FROM dispatch_entries`)
      .get() as { w: number };
    const salesReturnSum = db
      .prepare(`SELECT COALESCE(SUM(sales_return),0) AS w FROM orders`)
      .get() as { w: number };

    const openingStock = getOpeningStockKgs(db);
    const currentStock = openingStock + purchaseSum.w - dispatchSum.w - salesReturnSum.w;

    return {
      data: {
        total_order_kgs: totalOrderKgs,
        total_dispatch_kgs: totalDispatchKgs,
        pending_kgs: pendingKgsRow.p,
        profit_per_kg_positive_sum: profitAgg.pos,
        profit_per_kg_negative_sum: profitAgg.neg,
        opening_stock_kgs: openingStock,
        current_stock_kgs: currentStock,
        total_orders: db.prepare(`SELECT COUNT(1) AS c FROM orders`).get(),
      },
    };
  });
}
