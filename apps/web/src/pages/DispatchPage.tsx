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
import { createDispatchForLine, fetchDispatchForLine, fetchOrders } from "../lib/api";
import type { DispatchEntry, OrderRow } from "../lib/api";

export function DispatchPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);

  const [dispatchDate, setDispatchDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [dispatchWeight, setDispatchWeight] = useState<number>(0);
  const [transport, setTransport] = useState("");
  const [tallyBillsInput, setTallyBillsInput] = useState("");

  const [entries, setEntries] = useState<DispatchEntry[]>([]);
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
    fetchDispatchForLine(order.id)
      .then(setEntries)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load dispatch entries"))
      .finally(() => setLoadingEntries(false));
  }, [order]);

  const helper = useMemo(() => {
    if (!order) return null;
    const dispatched = entries.reduce((s, e) => s + (Number(e.dispatch_weight) || 0), 0);
    const bal = Math.max(0, Number(order.order_kgs) - dispatched);
    const maxAllowed = Number(order.order_kgs) + 300;
    return `Line ordered: ${Math.round(order.order_kgs)} kg • Dispatched (this line): ${Math.round(dispatched)} kg • Balance: ${Math.round(bal)} kg • Max allowed: ${Math.round(maxAllowed)} kg`;
  }, [order, entries]);

  async function submit() {
    if (!order) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await createDispatchForLine(order.id, {
        dispatch_date: dispatchDate,
        dispatch_weight: dispatchWeight,
        transport: transport.trim() || undefined,
        tally_bill_nos: tallyBillsInput
          .split(/[\n,]+/g)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setOrder(updated.find(u => u.id === order.id) ?? updated[0] ?? order);
      const list = await fetchDispatchForLine(order.id);
      setEntries(list);
      setDispatchWeight(0);
      setTransport("");
      setTallyBillsInput("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>
        Dispatch Entry
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
              options={orders}
              groupBy={(option) => `${option.wo_no} • ${option.client_name}`}
              loading={loadingOrders}
              value={order}
              onChange={(_, v) => setOrder(v)}
              getOptionLabel={(o) => `${o.item} ${o.size} ${o.grade} (${Math.round(o.order_kgs)} kg ordered)`}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Line Item"
                  placeholder="Search WO / client / product…"
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
                label="Dispatch date"
                type="date"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Dispatch weight (kg)"
                type="number"
                value={dispatchWeight}
                onChange={(e) => setDispatchWeight(Number(e.target.value))}
                helperText={helper ?? " "}
                fullWidth
              />
              <TextField
                label="Transport"
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
                fullWidth
              />
            </Stack>

              <TextField
                label="Tally bill no(s)"
                value={tallyBillsInput}
                onChange={(e) => setTallyBillsInput(e.target.value)}
                placeholder="Enter bill numbers separated by comma or new line"
                fullWidth
              />

            <Box>
              <Button variant="contained" disabled={!order || saving || dispatchWeight <= 0} onClick={submit}>
                {saving ? "Saving…" : "Add dispatch"}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography fontWeight={800} sx={{ mb: 1 }}>
            Recent dispatch entries
          </Typography>
          {loadingEntries ? (
            <CircularProgress size={22} />
          ) : entries.length === 0 ? (
            <Typography color="text.secondary">No dispatch entries yet.</Typography>
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
                  <Typography fontWeight={700}>{e.dispatch_date}</Typography>
                  <Typography>{Math.round(e.dispatch_weight)} kg</Typography>
                  <Typography color="text.secondary">{e.transport ?? "—"}</Typography>
                  <Typography color="text.secondary" sx={{ textAlign: "right" }}>
                    {e.tally_bill_nos && e.tally_bill_nos.length ? e.tally_bill_nos.join(", ") : "—"}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

