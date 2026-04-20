import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  Alert,
  Divider,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { Link as RouterLink } from "react-router-dom";
import dayjs from "dayjs";
import {
  createDispatch,
  createPayment,
  fetchDispatch,
  fetchOrders,
  fetchPayments,
  fetchProducts,
  patchOrder,
  patchOrderMeta,
  patchOrderLine,
  deleteOrder,
} from "../lib/api";
import type { MasterProduct, OrderRow } from "../lib/api";
import type { DispatchEntry, PaymentEntry } from "../lib/api";

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function kg(n: number) {
  return `${Math.round(n).toLocaleString()} kg`;
}

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

/** Invoice / dispatch / baki are per WO — count once per order_id */
function sumOncePerOrder(rows: OrderRow[], pick: (r: OrderRow) => number) {
  const seen = new Set<number>();
  let s = 0;
  for (const r of rows) {
    if (seen.has(r.order_id)) continue;
    seen.add(r.order_id);
    s += pick(r);
  }
  return s;
}

function mergeOrderRows(prev: OrderRow[], updated: OrderRow[]) {
  if (!updated.length) return prev;
  const oid = updated[0].order_id;
  return [...prev.filter((r) => r.order_id !== oid), ...updated].sort((a, b) => a.order_id - b.order_id || a.id - b.id);
}

function statusChip(status: OrderRow["payment_status"]) {
  if (status === "Paid") return <Chip size="small" color="success" label="Paid" />;
  if (status === "Partial") return <Chip size="small" color="warning" label="Partial" />;
  if (status === "Pending") return <Chip size="small" color="error" label="Pending" />;
  return <Chip size="small" variant="outlined" label="No invoice" />;
}

export function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [dispatchEntries, setDispatchEntries] = useState<DispatchEntry[]>([]);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [dispatchDate, setDispatchDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [dispatchWeight, setDispatchWeight] = useState<number>(0);
  const [transport, setTransport] = useState("");
  const [paymentDate, setPaymentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchOrders({ q: q.trim() || undefined })
      .then((data) => {
        if (!alive) return;
        setRows(data);
        setErr(null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, [q]);

  useEffect(() => {
    fetchProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const itemOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.item);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);

  useEffect(() => {
    if (!selected) return;
    setDrawerLoading(true);
    Promise.all([fetchDispatch(selected.id), fetchPayments(selected.order_id)])
      .then(([d, p]) => {
        setDispatchEntries(d);
        setPaymentEntries(p);
      })
      .catch(() => {
        // drawer fetch failures shouldn't kill the main table
        setDispatchEntries([]);
        setPaymentEntries([]);
      })
      .finally(() => setDrawerLoading(false));
  }, [selected?.order_id]);

  const header = useMemo(() => {
    const lineCount = rows.length;
    const orderCount = new Set(rows.map((r) => r.order_id)).size;
    const orderKgs = sum(rows.map((r) => r.order_kgs));
    const pending = sum(rows.map((r) => Math.max(0, r.balance_kgs)));
    const dispatchKgs = sum(rows.map((r) => r.dispatch_weight));
    const balanceKgs = sum(rows.map((r) => Math.max(0, r.balance_kgs)));
    const invoiceTotal = sumOncePerOrder(rows, (r) => r.invoice_total);
    const paidTotal = sumOncePerOrder(rows, (r) => r.paid_amount);
    const bakiTotal = sumOncePerOrder(rows, (r) => r.baki_amount);
    const profitPerKgWeighted =
      orderKgs > 0 ? sum(rows.map((r) => (r.bill_rate - r.avg_cost) * r.order_kgs)) / orderKgs : 0;
    return {
      lineCount,
      orderCount,
      pending,
      orderKgs,
      dispatchKgs,
      balanceKgs,
      invoiceTotal,
      paidTotal,
      bakiTotal,
      profitPerKgWeighted,
    };
  }, [rows]);

  async function saveHeaderPatch(orderId: number, body: Parameters<typeof patchOrder>[1]) {
    setSaving(true);
    try {
      const updated = await patchOrder(orderId, body);
      setRows((prev) => mergeOrderRows(prev, updated));
      setSelected((prev) => {
        if (!prev) return prev;
        const u = updated.find((x) => x.id === prev.id);
        return u ?? prev;
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveMetaPatch(orderId: number, body: Parameters<typeof patchOrderMeta>[1]) {
    setSaving(true);
    try {
      const updated = await patchOrderMeta(orderId, body);
      setRows((prev) => mergeOrderRows(prev, updated));
      setSelected((prev) => {
        if (!prev) return prev;
        const u = updated.find((x) => x.id === prev.id);
        return u ?? prev;
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveLinePatch(lineId: number, body: Parameters<typeof patchOrderLine>[1]) {
    setSaving(true);
    try {
      const updated = await patchOrderLine(lineId, body);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setSelected((prev) => (prev && prev.id === lineId ? updated : prev));
    } finally {
      setSaving(false);
    }
  }

  async function addDispatch() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await createDispatch(selected.id, {
        dispatch_date: dispatchDate,
        dispatch_weight: dispatchWeight,
        transport: transport.trim() || undefined,
      });
      setDispatchEntries(await fetchDispatch(selected.id));
      setRows((prev) => mergeOrderRows(prev, updated));
      setSelected((prev) => {
        if (!prev) return prev;
        const u = updated.find((x) => x.id === prev.id);
        return u ?? updated[0] ?? prev;
      });
      setDispatchWeight(0);
      setTransport("");
    } finally {
      setSaving(false);
    }
  }

  async function addPayment() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await createPayment(selected.order_id, {
        payment_date: paymentDate,
        amount: paymentAmount,
        note: paymentNote.trim() || undefined,
      });
      setPaymentEntries(await fetchPayments(selected.order_id));
      setRows((prev) => mergeOrderRows(prev, updated));
      setSelected((prev) => {
        if (!prev) return prev;
        const u = updated.find((x) => x.id === prev.id);
        return u ?? updated[0] ?? prev;
      });
      setPaymentAmount(0);
      setPaymentNote("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={900}>
            Orders
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {header.lineCount} lines • {header.orderCount} WOs • Pending balance {kg(header.pending)} • Total Baki{" "}
            <Box component="span" fontWeight={800} color={header.bakiTotal > 0.0001 ? "warning.main" : "text.primary"}>
              {money(header.bakiTotal)}
            </Box>
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" component={RouterLink} to="/orders/new">
            Add Order
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search WO / client / invoice / OR…"
          size="small"
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Stack>

      <Box
        sx={{
          display: "grid",
          gap: 1,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)", lg: "repeat(8, minmax(0, 1fr))" },
          mb: 2,
        }}
      >
        <SummaryChip label="Work orders" value={header.orderCount.toLocaleString()} />
        <SummaryChip label="Order Kgs" value={kg(header.orderKgs)} />
        <SummaryChip label="Dispatch" value={kg(header.dispatchKgs)} />
        <SummaryChip
          label="Balance (kg)"
          value={kg(header.balanceKgs)}
          tone={header.balanceKgs > 0.0001 ? "warning" : "neutral"}
        />
        <SummaryChip label="Invoice total" value={money(header.invoiceTotal)} />
        <SummaryChip label="Paid" value={money(header.paidTotal)} />
        <SummaryChip
          label="Baki"
          value={money(header.bakiTotal)}
          tone={header.bakiTotal > 0.0001 ? "warning" : "neutral"}
        />
        <SummaryChip
          label="AVE PRO (avg)"
          value={money(header.profitPerKgWeighted)}
          tone={header.profitPerKgWeighted < 0 ? "error" : "success"}
        />
      </Box>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box
          sx={{
            borderRadius: 3,
            overflowX: "auto",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            background: "#fff",
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                "120px 120px 220px 140px 160px 90px 110px 110px 110px 100px 100px 110px 100px 110px 110px",
              minWidth: 1800,
              gap: 0,
              borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            {[
              "Date",
              "WO No",
              "Client",
              "Product",
              "SIZE",
              "Grade",
              "Order Kgs",
              "Dispatch",
              "Balance",
              "AVE",
              "BILL RATE",
              "Bill No",
              "AVE PRO",
              "Paid",
              "Baki",
            ].map((h) => (
              <Box key={h} sx={{ px: 1.5, py: 1, fontWeight: 800, fontSize: 12 }}>
                {h}
              </Box>
            ))}
          </Box>

          {rows.map((r) => {
            const loss = r.profit_per_kg < 0;
            const pending = r.balance_kgs > 0.0001;
            return (
              <Box
                key={r.id}
                onClick={() => setSelected(r)}
                sx={{
                  display: "grid",
                  gridTemplateColumns:
                    "120px 120px 220px 140px 160px 90px 110px 110px 110px 100px 100px 110px 100px 110px 110px",
                  minWidth: 1800,
                  borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
                  cursor: "pointer",
                  "&:hover": { background: "rgba(37, 99, 235, 0.04)" },
                }}
              >
                <Cell>{r.order_date}</Cell>
                <Cell strong>{r.wo_no}</Cell>
                <Cell>{r.client_name}</Cell>
                <Cell>{r.item}</Cell>
                <Cell>
                  {r.size}
                  {r.length_nos ? ` • ${r.length_nos}` : ""}
                </Cell>
                <Cell>{r.grade}</Cell>
                <Cell>{kg(r.order_kgs)}</Cell>
                <Cell>{kg(r.dispatch_weight)}</Cell>
                <Cell highlight={pending ? "warning" : undefined}>{kg(r.balance_kgs)}</Cell>
                <Cell>{money(r.avg_cost)}</Cell>
                <Cell>{money(r.bill_rate)}</Cell>
                <Cell>{r.invoice_no ?? "—"}</Cell>
                <Cell highlight={loss ? "error" : "success"}>{money(r.profit_per_kg)}</Cell>
                <Cell highlight={r.paid_amount > 0 ? "success" : undefined}>{money(r.paid_amount)}</Cell>
                <Cell
                  highlight={
                    r.baki_amount > 0.0001 ? "warning" : r.invoice_total > 0 ? "success" : undefined
                  }
                >
                  {money(r.baki_amount)}
                </Cell>
              </Box>
            );
          })}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                "120px 120px 220px 140px 160px 90px 110px 110px 110px 100px 100px 110px 100px 110px 110px",
              minWidth: 1800,
              borderTop: "2px solid rgba(15, 23, 42, 0.12)",
              background: "rgba(15, 23, 42, 0.02)",
              position: "sticky",
              bottom: 0,
              zIndex: 1,
            }}
          >
            <Cell strong>Total</Cell>
            <Cell>{" "}</Cell>
            <Cell>{" "}</Cell>
            <Cell>{" "}</Cell>
            <Cell>{" "}</Cell>
            <Cell>{" "}</Cell>
            <Cell strong>{kg(header.orderKgs)}</Cell>
            <Cell strong>{kg(header.dispatchKgs)}</Cell>
            <Cell strong highlight={header.balanceKgs > 0.0001 ? "warning" : undefined}>
              {kg(header.balanceKgs)}
            </Cell>
            <Cell>{" "}</Cell>
            <Cell>{" "}</Cell>
            <Cell>{" "}</Cell>
            <Cell strong highlight={header.profitPerKgWeighted < 0 ? "error" : "success"}>
              {money(header.profitPerKgWeighted)}
            </Cell>
            <Cell strong highlight={header.paidTotal > 0 ? "success" : undefined}>
              {money(header.paidTotal)}
            </Cell>
            <Cell strong highlight={header.bakiTotal > 0.0001 ? "warning" : undefined}>
              {money(header.bakiTotal)}
            </Cell>
          </Box>
        </Box>
      )}

      <Drawer
        anchor="right"
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        PaperProps={{ sx: { width: 520 } }}
      >
        {selected ? (
          <Box sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography fontWeight={900}>{selected.wo_no}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {selected.client_name} • {selected.item} • {selected.size} • {selected.grade}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <IconButton color="error" size="small" onClick={async () => {
                  setSaving(true);
                  try {
                    await deleteOrder(selected.order_id);
                    setRows(prev => prev.filter(r => r.order_id !== selected.order_id));
                    setSelected(null);
                  } catch (e: unknown) {
                    alert(e instanceof Error ? e.message : "Failed to delete");
                  } finally {
                    setSaving(false);
                  }
                }}>
                  <DeleteOutlineIcon />
                </IconButton>
                <IconButton size="small" onClick={() => setSelected(null)}>
                  <CloseIcon />
                </IconButton>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              {statusChip(selected.payment_status)}
              {selected.balance_kgs > 0 ? <Chip size="small" color="warning" label="Pending" /> : null}
              {selected.profit_per_kg < 0 ? <Chip size="small" color="error" label="Loss" /> : <Chip size="small" color="success" label="Profit" />}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
              Work order (editable)
            </Typography>

            <Stack spacing={1.5}>
              <TextField
                label="WO Number"
                size="small"
                value={selected.wo_no}
                onChange={(e) => setSelected({ ...selected, wo_no: e.target.value })}
                onBlur={() => saveMetaPatch(selected.order_id, { wo_no: selected.wo_no })}
                disabled={saving}
              />
              <TextField
                label="Order date"
                size="small"
                type="date"
                value={selected.order_date}
                InputLabelProps={{ shrink: true }}
                onChange={(e) => setSelected({ ...selected, order_date: e.target.value })}
                onBlur={() => saveMetaPatch(selected.order_id, { order_date: selected.order_date })}
                disabled={saving}
              />
              <TextField
                label="Client name"
                size="small"
                value={selected.client_name}
                onChange={(e) => setSelected({ ...selected, client_name: e.target.value })}
                onBlur={() => saveMetaPatch(selected.order_id, { client_name: selected.client_name })}
                disabled={saving}
              />

              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={800}>
                Line item (editable)
              </Typography>
              <Autocomplete
                options={itemOptions}
                freeSolo
                value={selected.item || null}
                inputValue={selected.item}
                onInputChange={(_, v) => setSelected({ ...selected, item: v, size: "", grade: "" })}
                onBlur={() => saveLinePatch(selected.id, { item: selected.item })}
                renderInput={(params) => <TextField {...params} label="Item" size="small" />}
              />

              <Stack direction="row" spacing={1}>
                <Autocomplete
                  options={[...new Set(products.filter((p) => p.item === selected.item).map((p) => p.size))].sort((a, b) =>
                    a.localeCompare(b),
                  )}
                  freeSolo
                  value={selected.size || null}
                  inputValue={selected.size}
                  onInputChange={(_, v) => setSelected({ ...selected, size: v, grade: "" })}
                  onBlur={() => saveLinePatch(selected.id, { size: selected.size })}
                  renderInput={(params) => <TextField {...params} label="Size" size="small" />}
                  sx={{ flex: 1 }}
                />
                <Autocomplete
                  options={[...new Set(products.filter((p) => p.item === selected.item && p.size === selected.size).map((p) => p.grade))].sort(
                    (a, b) => a.localeCompare(b),
                  )}
                  freeSolo
                  value={selected.grade || null}
                  inputValue={selected.grade}
                  onInputChange={(_, v) => setSelected({ ...selected, grade: v })}
                  onBlur={() => saveLinePatch(selected.id, { grade: selected.grade })}
                  renderInput={(params) => <TextField {...params} label="Grade" size="small" />}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <TextField
                label="Length / Nos"
                size="small"
                value={selected.length_nos ?? ""}
                onChange={(e) => setSelected({ ...selected, length_nos: e.target.value || null })}
                onBlur={() => saveLinePatch(selected.id, { length_nos: selected.length_nos } as any)}
                disabled={saving}
              />
              <TextField
                label="Order weight (kg)"
                size="small"
                type="number"
                value={selected.order_kgs}
                onChange={(e) => setSelected({ ...selected, order_kgs: Number(e.target.value) })}
                onBlur={() => saveLinePatch(selected.id, { order_kgs: selected.order_kgs } as any)}
                disabled={saving}
              />

              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" fontWeight={800}>
                Billing & Payments (editable)
              </Typography>
              <TextField
                label="BILL RATE"
                size="small"
                type="number"
                value={selected.bill_rate}
                onChange={(e) => setSelected({ ...selected, bill_rate: Number(e.target.value) })}
                onBlur={() => saveLinePatch(selected.id, { bill_rate: selected.bill_rate })}
                disabled={saving}
              />
              <TextField
                label="AVE (avg cost)"
                size="small"
                type="number"
                value={selected.avg_cost}
                onChange={(e) => setSelected({ ...selected, avg_cost: Number(e.target.value) })}
                onBlur={() => saveLinePatch(selected.id, { avg_cost: selected.avg_cost })}
                disabled={saving}
              />
              <TextField
                label="Invoice No"
                size="small"
                value={selected.invoice_no ?? ""}
                onChange={(e) => setSelected({ ...selected, invoice_no: e.target.value || null })}
                onBlur={() => saveHeaderPatch(selected.order_id, { invoice_no: selected.invoice_no })}
                disabled={saving}
              />
              <TextField
                label="Invoice Total"
                size="small"
                type="number"
                value={selected.invoice_total}
                onChange={(e) => setSelected({ ...selected, invoice_total: Number(e.target.value) })}
                onBlur={() => saveHeaderPatch(selected.order_id, { invoice_total: selected.invoice_total })}
                disabled={saving}
              />
              <TextField
                label="Paid Amount"
                size="small"
                type="number"
                value={selected.paid_amount}
                onChange={(e) => setSelected({ ...selected, paid_amount: Number(e.target.value) })}
                onBlur={() => saveHeaderPatch(selected.order_id, { paid_amount: selected.paid_amount })}
                disabled={saving}
              />
              <Alert severity="info">
                Baki: <b>{money(selected.baki_amount)}</b> • Balance: <b>{kg(selected.balance_kgs)}</b> • Profit/kg:{" "}
                <b>{money(selected.profit_per_kg)}</b>
              </Alert>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
              Dispatch (this line item)
            </Typography>
            {drawerLoading ? (
              <Typography variant="body2" color="text.secondary">
                Loading…
              </Typography>
            ) : (
              <>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <TextField
                    label="Date"
                    size="small"
                    type="date"
                    value={dispatchDate}
                    onChange={(e) => setDispatchDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Weight (kg)"
                    size="small"
                    type="number"
                    value={dispatchWeight}
                    onChange={(e) => setDispatchWeight(Number(e.target.value))}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <TextField
                    label="Transport"
                    size="small"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <Button variant="contained" disabled={saving || dispatchWeight <= 0} onClick={addDispatch}>
                    Add
                  </Button>
                </Stack>
                {dispatchEntries.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No dispatch entries yet.
                  </Typography>
                ) : (
                  <Box sx={{ display: "grid", gap: 0.75 }}>
                    {dispatchEntries.slice(0, 8).map((d) => (
                      <Box
                        key={d.id}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          border: "1px solid rgba(15,23,42,0.08)",
                          borderRadius: 2,
                          px: 1.25,
                          py: 0.75,
                          fontSize: 12.5,
                        }}
                      >
                        <b>{d.dispatch_date}</b>
                        <span>{Math.round(d.dispatch_weight)} kg</span>
                        <span style={{ color: "rgba(15,23,42,0.55)" }}>{d.transport ?? "—"}</span>
                      </Box>
                    ))}
                  </Box>
                )}

                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                  Payments (entries)
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <TextField
                    label="Date"
                    size="small"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Amount"
                    size="small"
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <TextField
                    label="Note"
                    size="small"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <Button variant="contained" disabled={saving || paymentAmount <= 0} onClick={addPayment}>
                    Add
                  </Button>
                </Stack>
                {paymentEntries.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No payment entries yet.
                  </Typography>
                ) : (
                  <Box sx={{ display: "grid", gap: 0.75 }}>
                    {paymentEntries.slice(0, 8).map((p) => (
                      <Box
                        key={p.id}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          border: "1px solid rgba(15,23,42,0.08)",
                          borderRadius: 2,
                          px: 1.25,
                          py: 0.75,
                          fontSize: 12.5,
                        }}
                      >
                        <b>{p.payment_date}</b>
                        <span>{money(p.amount)}</span>
                        <span style={{ color: "rgba(15,23,42,0.55)" }}>{p.note ?? "—"}</span>
                      </Box>
                    ))}
                  </Box>
                )}
              </>
            )}
          </Box>
        ) : null}
      </Drawer>
    </Box>
  );
}

function SummaryChip(props: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  const bg =
    props.tone === "success"
      ? "rgba(22, 163, 74, 0.10)"
      : props.tone === "warning"
        ? "rgba(217, 119, 6, 0.12)"
        : props.tone === "error"
          ? "rgba(220, 38, 38, 0.10)"
          : "rgba(15, 23, 42, 0.04)";

  const border =
    props.tone === "success"
      ? "rgba(22, 163, 74, 0.25)"
      : props.tone === "warning"
        ? "rgba(217, 119, 6, 0.25)"
        : props.tone === "error"
          ? "rgba(220, 38, 38, 0.25)"
          : "rgba(15, 23, 42, 0.08)";

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1px solid ${border}`,
        background: bg,
        px: 1.25,
        py: 1,
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={800}>
        {props.label}
      </Typography>
      <Typography fontWeight={900}>{props.value}</Typography>
    </Box>
  );
}

function Cell(props: { children: React.ReactNode; strong?: boolean; highlight?: "error" | "warning" | "success" }) {
  const bg =
    props.highlight === "error"
      ? "rgba(220, 38, 38, 0.08)"
      : props.highlight === "warning"
        ? "rgba(217, 119, 6, 0.10)"
        : props.highlight === "success"
          ? "rgba(22, 163, 74, 0.08)"
          : undefined;

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1,
        fontSize: 12.5,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        background: bg,
        fontWeight: props.strong ? 800 : 500,
      }}
    >
      {props.children}
    </Box>
  );
}

