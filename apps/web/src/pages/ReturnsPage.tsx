import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, IconButton, Stack, TextField, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import dayjs from "dayjs";
import {
  createPurchaseReturn,
  createSalesReturn,
  deletePurchaseReturn,
  deleteSalesReturn,
  fetchPurchaseLedger,
  fetchPurchaseReturns,
  fetchSalesReturns,
  fetchOrders,
} from "../lib/api";
import type { PurchaseLedgerRow, PurchaseReturnRow, SalesReturnRow } from "../lib/api";
import type { OrderRow } from "../lib/api";

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function ReturnsPage() {
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [pos, setPos] = useState<PurchaseLedgerRow[]>([]);
  const [salesReturns, setSalesReturns] = useState<SalesReturnRow[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturnRow[]>([]);

  const [salesOrderId, setSalesOrderId] = useState<number>(0);
  const [salesDate, setSalesDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [salesWeight, setSalesWeight] = useState<number>(0);
  const [salesNote, setSalesNote] = useState("");

  const [poId, setPoId] = useState<number>(0);
  const [poDate, setPoDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [poWeight, setPoWeight] = useState<number>(0);
  const [poNote, setPoNote] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([fetchOrders(), fetchPurchaseLedger(), fetchSalesReturns(), fetchPurchaseReturns()])
      .then(([o, p, sr, pr]) => {
        if (!alive) return;
        setOrders(o);
        setPos(p);
        setSalesReturns(sr);
        setPurchaseReturns(pr);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const orderChoices = useMemo(() => {
    const byId = new Map<number, OrderRow>();
    for (const r of orders) if (!byId.has(r.order_id)) byId.set(r.order_id, r);
    return [...byId.values()].sort((a, b) => b.order_id - a.order_id);
  }, [orders]);

  const poChoices = useMemo(() => pos.slice().sort((a, b) => b.id - a.id), [pos]);

  async function refresh() {
    const [sr, pr] = await Promise.all([fetchSalesReturns(), fetchPurchaseReturns()]);
    setSalesReturns(sr);
    setPurchaseReturns(pr);
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>
        Returns
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      ) : null}

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography fontWeight={900} sx={{ mb: 1 }}>
              Dispatch Return (Sales return)
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                select
                SelectProps={{ native: true }}
                label="Order (WO)"
                size="small"
                value={salesOrderId || ""}
                onChange={(e) => setSalesOrderId(Number(e.target.value))}
              >
                <option value="" disabled>
                  Select WO…
                </option>
                {orderChoices.map((o) => (
                  <option key={o.order_id} value={o.order_id}>
                    {o.wo_no} — {o.client_name}
                  </option>
                ))}
              </TextField>
              <TextField
                label="Return date"
                size="small"
                type="date"
                value={salesDate}
                InputLabelProps={{ shrink: true }}
                onChange={(e) => setSalesDate(e.target.value)}
              />
              <TextField
                label="Weight (kg)"
                size="small"
                type="number"
                value={salesWeight}
                onChange={(e) => setSalesWeight(Number(e.target.value))}
              />
              <TextField label="Note" size="small" value={salesNote} onChange={(e) => setSalesNote(e.target.value)} />
              <Button
                variant="contained"
                disabled={saving || !salesOrderId || salesWeight <= 0}
                onClick={async () => {
                  setSaving(true);
                  setErr(null);
                  try {
                    await createSalesReturn({
                      order_id: salesOrderId,
                      return_date: salesDate,
                      weight: salesWeight,
                      note: salesNote.trim() || undefined,
                    });
                    setSalesWeight(0);
                    setSalesNote("");
                    await refresh();
                  } catch (e: unknown) {
                    setErr(e instanceof Error ? e.message : "Failed to save sales return");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Add sales return
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography fontWeight={900} sx={{ mb: 1 }}>
              Incoming RM Return (Purchase return)
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                select
                SelectProps={{ native: true }}
                label="Purchase order"
                size="small"
                value={poId || ""}
                onChange={(e) => setPoId(Number(e.target.value))}
              >
                <option value="" disabled>
                  Select PO…
                </option>
                {poChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.po_no ?? `PO#${p.id}`} — {p.supplier_name} — {p.item ?? ""} {p.size ?? ""} {p.grade ?? ""}
                  </option>
                ))}
              </TextField>
              <TextField
                label="Return date"
                size="small"
                type="date"
                value={poDate}
                InputLabelProps={{ shrink: true }}
                onChange={(e) => setPoDate(e.target.value)}
              />
              <TextField
                label="Weight (kg)"
                size="small"
                type="number"
                value={poWeight}
                onChange={(e) => setPoWeight(Number(e.target.value))}
              />
              <TextField label="Note" size="small" value={poNote} onChange={(e) => setPoNote(e.target.value)} />
              <Button
                variant="contained"
                disabled={saving || !poId || poWeight <= 0}
                onClick={async () => {
                  setSaving(true);
                  setErr(null);
                  try {
                    await createPurchaseReturn({
                      purchase_entry_id: poId,
                      return_date: poDate,
                      weight: poWeight,
                      note: poNote.trim() || undefined,
                    });
                    setPoWeight(0);
                    setPoNote("");
                    await refresh();
                  } catch (e: unknown) {
                    setErr(e instanceof Error ? e.message : "Failed to save purchase return");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Add purchase return
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography fontWeight={900} sx={{ mb: 1 }}>
              Sales returns history
            </Typography>
            {salesReturns.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No sales returns yet.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {salesReturns.map((r) => (
                  <Box
                    key={r.id}
                    sx={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: 1, p: 1, display: "flex", justifyContent: "space-between" }}
                  >
                    <Box>
                      <b>{r.return_date}</b> — {money(r.weight)} kg — order #{r.order_id}
                      {r.note ? (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {r.note}
                        </Typography>
                      ) : null}
                    </Box>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await deleteSalesReturn(r.id);
                          await refresh();
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography fontWeight={900} sx={{ mb: 1 }}>
              Purchase returns history
            </Typography>
            {purchaseReturns.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No purchase returns yet.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {purchaseReturns.map((r) => (
                  <Box
                    key={r.id}
                    sx={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: 1, p: 1, display: "flex", justifyContent: "space-between" }}
                  >
                    <Box>
                      <b>{r.return_date}</b> — {money(r.weight)} kg — PO #{r.purchase_entry_id}
                      {r.note ? (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {r.note}
                        </Typography>
                      ) : null}
                    </Box>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await deletePurchaseReturn(r.id);
                          await refresh();
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

