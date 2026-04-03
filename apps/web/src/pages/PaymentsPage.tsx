import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { createPayment, fetchOrders, fetchPayments } from "../lib/api";
import type { OrderRow, PaymentEntry } from "../lib/api";

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

export function PaymentsPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);

  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState("");

  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoadingOrders(true);
    fetchOrders()
      .then(setOrders)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load orders"))
      .finally(() => setLoadingOrders(false));
  }, []);

  useEffect(() => {
    if (!order) return;
    setLoadingEntries(true);
    fetchPayments(order.order_id)
      .then(setEntries)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load payments"))
      .finally(() => setLoadingEntries(false));
  }, [order]);

  const baki = useMemo(() => {
    if (!order) return null;
    return order.baki_amount;
  }, [order]);

  async function submit() {
    if (!order) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await createPayment(order.order_id, {
        payment_date: date,
        amount,
        note: note.trim() || undefined,
      });
      setOrder(updated[0] ?? order);
      const list = await fetchPayments(order.order_id);
      setEntries(list);
      setAmount(0);
      setNote("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>
        Payment Tracking
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack spacing={2}>
            <Autocomplete
              options={uniqueByOrder(orders).filter((o) => o.invoice_total > 0)}
              loading={loadingOrders}
              value={order}
              onChange={(_, v) => setOrder(v)}
              getOptionLabel={(o) =>
                `${o.invoice_no ?? "No invoice"} • ${o.wo_no} • ${o.client_name} • baki ${Math.round(o.baki_amount)}`
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select invoice / WO"
                  placeholder="Search…"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingOrders ? <CircularProgress size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Payment date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                helperText={order ? `Baki: ${Math.round(baki ?? 0)}` : " "}
                fullWidth
              />
              <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
            </Stack>

            <Box>
              <Button variant="contained" disabled={!order || saving || amount <= 0} onClick={submit}>
                {saving ? "Saving…" : "Add payment"}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography fontWeight={800} sx={{ mb: 1 }}>
            Payment entries
          </Typography>
          {loadingEntries ? (
            <CircularProgress size={22} />
          ) : entries.length === 0 ? (
            <Typography color="text.secondary">No payment entries yet.</Typography>
          ) : (
            <Box sx={{ display: "grid", gap: 1 }}>
              {entries.map((e) => (
                <Box
                  key={e.id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    border: "1px solid rgba(15,23,42,0.08)",
                    borderRadius: 2,
                    px: 1.5,
                    py: 1,
                  }}
                >
                  <Typography fontWeight={700}>{e.payment_date}</Typography>
                  <Typography>{e.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Typography>
                  <Typography color="text.secondary">{e.note ?? "—"}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

