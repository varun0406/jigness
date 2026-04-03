import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { fetchOrders, patchOrder } from "../lib/api";
import type { OrderRow } from "../lib/api";

function uniqueByOrder(rows: OrderRow[]): OrderRow[] {
  const seen = new Set<number>();
  const out: OrderRow[] = [];
  for (const r of rows) {
    if (seen.has(r.order_id)) continue;
    seen.add(r.order_id);
    out.push(r);
  }
  return out;
}

export function BillingPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceTotal, setInvoiceTotal] = useState<number>(0);

  const options = useMemo(() => uniqueByOrder(orders), [orders]);

  useEffect(() => {
    setLoading(true);
    fetchOrders()
      .then((d) => {
        setOrders(d);
        setErr(null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!order) return;
    setInvoiceNo(order.invoice_no ?? `INV-${dayjs().format("YYMMDD")}-${order.order_id}`);
    setInvoiceTotal(order.invoice_total ?? 0);
  }, [order]);

  async function save() {
    if (!order) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await patchOrder(order.order_id, {
        invoice_no: invoiceNo.trim() || null,
        invoice_total: invoiceTotal,
      });
      setOrders((prev) => {
        const merged = [...prev.filter((r) => r.order_id !== order.order_id), ...updated];
        return merged.sort((a, b) => a.order_id - b.order_id || a.id - b.id);
      });
      const first = updated[0];
      if (first) setOrder(first);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>
        Billing
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Invoice applies to the whole work order. Use <b>Orders</b> to set BILL RATE / AVE per line item.
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Autocomplete
              options={options}
              loading={loading}
              value={order}
              onChange={(_, v) => setOrder(v)}
              getOptionLabel={(o) => `${o.wo_no} • ${o.client_name}`}
              renderInput={(params) => <TextField {...params} label="Select WO / Client" />}
            />

            {order ? (
              <>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <TextField label="Invoice No" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} fullWidth />
                  <TextField
                    label="Invoice total"
                    type="number"
                    value={invoiceTotal}
                    onChange={(e) => setInvoiceTotal(Number(e.target.value))}
                    fullWidth
                  />
                </Stack>

                <Box>
                  <Button variant="contained" onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save invoice"}
                  </Button>
                </Box>
              </>
            ) : (
              <Typography color="text.secondary">Pick a WO to generate/update invoice.</Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
