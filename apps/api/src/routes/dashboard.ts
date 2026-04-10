import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { getMinimumStockKgs, getOpeningStockKgs } from "./inventory.js";

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

    const incomingMaterial = (
      db.prepare(`SELECT COALESCE(SUM(weight_received),0) AS w FROM purchase_receipts`).get() as { w: number }
    ).w;
    const dispatchTotal = (
      db.prepare(`SELECT COALESCE(SUM(dispatch_weight),0) AS w FROM dispatch_entries`).get() as { w: number }
    ).w;
    const dispatchReturn = (db.prepare(`SELECT COALESCE(SUM(weight),0) AS w FROM sales_returns`).get() as { w: number }).w;
    const incomingRmReturn = (
      db.prepare(`SELECT COALESCE(SUM(weight),0) AS w FROM purchase_returns`).get() as { w: number }
    ).w;

    const pendingPurchaseOrders = (
      db
        .prepare(`SELECT COALESCE(SUM(CASE WHEN (weight - received_weight) > 0 THEN (weight - received_weight) ELSE 0 END), 0) AS w FROM purchase_entries`)
        .get() as { w: number }
    ).w;

    const pendingSalesOrders = pendingKgsRow.p;

    const openingStock = getOpeningStockKgs(db);
    const minimumStock = getMinimumStockKgs(db);
    const currentStock = openingStock + incomingMaterial + dispatchReturn - dispatchTotal - incomingRmReturn;

    // Per requested formula:
    // PurchaseRequired = (Opening + IncomingMaterial - MinimumStock) + PendingPurchaseOrders - DispatchTotal - PendingSalesOrders
    // Note: returns are already included in CurrentStock, but the requested formula didn't mention them explicitly.
    const purchaseRequired =
      (openingStock + incomingMaterial - minimumStock) + pendingPurchaseOrders - dispatchTotal - pendingSalesOrders;

    return {
      data: {
        total_order_kgs: totalOrderKgs,
        total_dispatch_kgs: totalDispatchKgs,
        pending_kgs: pendingKgsRow.p,
        profit_per_kg_positive_sum: profitAgg.pos,
        profit_per_kg_negative_sum: profitAgg.neg,
        opening_stock_kgs: openingStock,
        minimum_stock_kgs: minimumStock,
        current_stock_kgs: currentStock,
        purchase_required_kgs: purchaseRequired,
        breakdown: {
          pending_sales_orders_kgs: pendingSalesOrders,
          pending_purchase_orders_kgs: pendingPurchaseOrders,
          incoming_material_kgs: incomingMaterial,
          dispatch_kgs: dispatchTotal,
          dispatch_return_kgs: dispatchReturn,
          incoming_rm_return_kgs: incomingRmReturn,
        },
        total_orders: db.prepare(`SELECT COUNT(1) AS c FROM orders`).get(),
      },
    };
  });
}
