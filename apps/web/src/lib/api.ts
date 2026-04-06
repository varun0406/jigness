import axios from "axios";
import { clearAuthToken, getAuthToken } from "./auth";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001",
});

api.interceptors.request.use((config) => {
  const t = getAuthToken();
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      const url = String(err.config?.url ?? "");
      if (!url.includes("/auth/login")) {
        clearAuthToken();
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
      }
    }
    return Promise.reject(err);
  },
);

export type OrderRow = {
  /** Line item id (unique per grid row) */
  id: number;
  /** Work order / header id (dispatch, payments, invoice) */
  order_id: number;
  wo_no: string;
  order_date: string;
  client_name: string;
  size: string;
  item: string;
  grade: string;
  length_nos: string | null;
  order_kgs: number;
  dispatch_weight: number;
  balance_kgs: number;
  avg_cost: number;
  bill_rate: number;
  profit_per_kg: number;
  or_no: string | null;
  sales_date: string | null;
  weight_sold: number;
  sales_return: number;
  invoice_no: string | null;
  invoice_total: number;
  paid_amount: number;
  baki_amount: number;
  payment_status: "NoInvoice" | "Paid" | "Partial" | "Pending";
};

export async function fetchOrders(params?: {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
}) {
  const res = await api.get<{ data: OrderRow[] }>("/orders", { params });
  return res.data.data;
}

export type CreateOrderLine = {
  size: string;
  item: string;
  grade: string;
  length_nos?: string;
  order_kgs: number;
  bill_rate: number;
};

export async function createOrder(body: {
  wo_no: string;
  order_date: string;
  client_name: string;
  lines: CreateOrderLine[];
}) {
  const res = await api.post<{ data: OrderRow[] }>("/orders", body);
  return res.data.data;
}

export async function patchOrder(
  orderId: number,
  body: Partial<Pick<OrderRow, "invoice_no" | "invoice_total" | "paid_amount">>,
) {
  const res = await api.patch<{ data: OrderRow[] }>(`/orders/${orderId}`, body);
  return res.data.data;
}

export async function patchOrderMeta(
  orderId: number,
  body: Partial<Pick<OrderRow, "wo_no" | "order_date" | "client_name">>,
) {
  const res = await api.patch<{ data: OrderRow[] }>(`/orders/${orderId}/meta`, body);
  return res.data.data;
}

export async function patchOrderLine(
  lineId: number,
  body: Partial<Pick<OrderRow, "size" | "item" | "grade" | "length_nos" | "order_kgs" | "bill_rate" | "avg_cost">>,
) {
  const res = await api.patch<{ data: OrderRow }>(`/order-lines/${lineId}`, body);
  return res.data.data;
}

export async function addOrderLine(orderId: number, body: CreateOrderLine) {
  const res = await api.post<{ data: OrderRow }>(`/orders/${orderId}/lines`, body);
  return res.data.data;
}

export async function deleteOrderLine(lineId: number) {
  const res = await api.delete<{ data: OrderRow[] }>(`/order-lines/${lineId}`);
  return res.data.data;
}

export async function deleteOrder(orderId: number) {
  const res = await api.delete<{ data: { success: boolean } }>(`/orders/${orderId}`);
  return res.data.data;
}

export type MasterClient = { id: number; name: string };
export type MasterSupplier = { id: number; name: string };
export type MasterProduct = { id: number; size: string; item: string; grade: string; avg_cost: number };

export async function fetchClients() {
  const res = await api.get<{ data: MasterClient[] }>("/masters/clients");
  return res.data.data;
}
export async function fetchSuppliers() {
  const res = await api.get<{ data: MasterSupplier[] }>("/masters/suppliers");
  return res.data.data;
}
export async function fetchProducts() {
  const res = await api.get<{ data: MasterProduct[] }>("/masters/products");
  return res.data.data;
}

export type DashboardSummary = {
  total_order_kgs: number;
  total_dispatch_kgs: number;
  pending_kgs: number;
  opening_stock_kgs: number;
  minimum_stock_kgs: number;
  current_stock_kgs: number;
  purchase_required_kgs: number;
  profit_per_kg_positive_sum: number;
  profit_per_kg_negative_sum: number;
  total_orders: { c: number };
  breakdown: {
    pending_sales_orders_kgs: number;
    pending_purchase_orders_kgs: number;
    incoming_material_kgs: number;
    dispatch_kgs: number;
    dispatch_return_kgs: number;
    incoming_rm_return_kgs: number;
  };
};

export async function fetchDashboardSummary() {
  const res = await api.get<{ data: DashboardSummary }>("/dashboard/summary");
  return res.data.data;
}

export async function patchOpeningStock(opening_stock_kgs: number) {
  const res = await api.patch<{ data: { opening_stock_kgs: number } }>("/inventory/opening-stock", {
    opening_stock_kgs,
  });
  return res.data.data;
}

export async function patchMinimumStock(minimum_stock_kgs: number) {
  const res = await api.patch<{ data: { minimum_stock_kgs: number } }>("/inventory/minimum-stock", {
    minimum_stock_kgs,
  });
  return res.data.data;
}

export type DispatchEntry = {
  id: number;
  dispatch_date: string;
  dispatch_weight: number;
  transport: string | null;
  created_at: string;
};

export async function createDispatch(orderId: number, body: { dispatch_date: string; dispatch_weight: number; transport?: string }) {
  const res = await api.post<{ data: OrderRow[] }>(`/orders/${orderId}/dispatch`, body);
  return res.data.data;
}

export async function fetchDispatch(orderId: number) {
  const res = await api.get<{ data: DispatchEntry[] }>(`/orders/${orderId}/dispatch`);
  return res.data.data;
}

export async function patchDispatch(dispatchId: number, body: Partial<Pick<DispatchEntry, "dispatch_date" | "dispatch_weight" | "transport">>) {
  const res = await api.patch<{ data: OrderRow[] }>(`/dispatch/${dispatchId}`, body);
  return res.data.data;
}

export async function deleteDispatch(dispatchId: number) {
  const res = await api.delete<{ data: OrderRow[] }>(`/dispatch/${dispatchId}`);
  return res.data.data;
}

export type PurchaseLedgerRow = {
  id: number;
  po_no: string | null;
  purchase_date: string;
  supplier_name: string;
  size: string | null;
  item: string | null;
  grade: string | null;
  weight: number;
  received_weight: number;
  balance_weight: number;
  rate: number;
  amount_ordered: number;
  amount_received: number;
  debit_note: string | null;
  rec_note: string | null;
};

export async function createPurchase(body: {
  supplier_name: string;
  po_no?: string;
  purchase_date: string;
  weight: number;
  rate: number;
  debit_note?: string;
  size: string;
  item: string;
  grade: string;
}) {
  const res = await api.post<{ data: PurchaseLedgerRow }>("/purchase", body);
  return res.data.data;
}

export async function fetchPurchaseLedger() {
  const res = await api.get<{ data: PurchaseLedgerRow[] }>("/purchase-ledger");
  return res.data.data;
}

export type PurchaseReceiptRow = {
  id: number;
  receipt_date: string;
  weight_received: number;
  note: string | null;
  created_at: string;
};

export async function fetchPurchaseReceipts(purchaseId: number) {
  const res = await api.get<{ data: PurchaseReceiptRow[] }>(`/purchase/${purchaseId}/receipts`);
  return res.data.data;
}

export async function createPurchaseReceipt(
  purchaseId: number,
  body: { receipt_date: string; weight_received: number; note?: string },
) {
  const res = await api.post<{ data: PurchaseLedgerRow }>(`/purchase/${purchaseId}/receipt`, body);
  return res.data.data;
}

export async function patchPurchase(
  purchaseId: number,
  body: Partial<
    Pick<PurchaseLedgerRow, "supplier_name" | "po_no" | "purchase_date" | "weight" | "rate" | "debit_note" | "rec_note" | "size" | "item" | "grade">
  >,
) {
  const res = await api.patch<{ data: PurchaseLedgerRow }>(`/purchase/${purchaseId}`, body);
  return res.data.data;
}

export async function patchPurchaseReceipt(
  receiptId: number,
  body: Partial<Pick<PurchaseReceiptRow, "receipt_date" | "weight_received" | "note">>,
) {
  const res = await api.patch<{ data: PurchaseLedgerRow }>(`/purchase-receipts/${receiptId}`, body);
  return res.data.data;
}

export async function deletePurchaseReceipt(receiptId: number) {
  const res = await api.delete<{ data: PurchaseLedgerRow }>(`/purchase-receipts/${receiptId}`);
  return res.data.data;
}

export async function patchPurchaseRecNote(purchaseId: number, rec_note: string | null) {
  const res = await api.patch<{ data: PurchaseLedgerRow }>(`/purchase/${purchaseId}`, { rec_note });
  return res.data.data;
}

export async function deletePurchase(purchaseId: number) {
  const res = await api.delete<{ data: { success: boolean } }>(`/purchase/${purchaseId}`);
  return res.data.data;
}

export type PaymentEntry = {
  id: number;
  payment_date: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export async function fetchPayments(orderId: number) {
  const res = await api.get<{ data: PaymentEntry[] }>(`/orders/${orderId}/payments`);
  return res.data.data;
}

export async function createPayment(orderId: number, body: { payment_date: string; amount: number; note?: string }) {
  const res = await api.post<{ data: OrderRow[] }>(`/orders/${orderId}/payments`, body);
  return res.data.data;
}

export type SalesReturnRow = {
  id: number;
  order_id: number;
  return_date: string;
  weight: number;
  note: string | null;
  created_at: string;
};

export type PurchaseReturnRow = {
  id: number;
  purchase_entry_id: number;
  return_date: string;
  weight: number;
  note: string | null;
  created_at: string;
};

export async function fetchSalesReturns() {
  const res = await api.get<{ data: SalesReturnRow[] }>("/returns/sales");
  return res.data.data;
}

export async function createSalesReturn(body: { order_id: number; return_date: string; weight: number; note?: string }) {
  const res = await api.post<{ data: { success: true } }>("/returns/sales", body);
  return res.data.data;
}

export async function deleteSalesReturn(id: number) {
  const res = await api.delete<{ data: { success: true } }>(`/returns/sales/${id}`);
  return res.data.data;
}

export async function fetchPurchaseReturns() {
  const res = await api.get<{ data: PurchaseReturnRow[] }>("/returns/purchase");
  return res.data.data;
}

export async function createPurchaseReturn(body: { purchase_entry_id: number; return_date: string; weight: number; note?: string }) {
  const res = await api.post<{ data: { success: true } }>("/returns/purchase", body);
  return res.data.data;
}

export async function deletePurchaseReturn(id: number) {
  const res = await api.delete<{ data: { success: true } }>(`/returns/purchase/${id}`);
  return res.data.data;
}

