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
import { createDispatch, fetchDispatch, fetchOrders } from "../lib/api";
import type { DispatchEntry, OrderRow } from "../lib/api";

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

  const woOptions = useMemo(() => uniqueByOrder(orders), [orders]);

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
    fetchDispatch(order.order_id)
      .then(setEntries)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load dispatch entries"))
      .finally(() => setLoadingEntries(false));
  }, [order]);

  const helper = useMemo(() => {
    if (!order) return null;
    return `Balance: ${Math.round(order.balance_kgs)} kg • Dispatched: ${Math.round(order.dispatch_weight)} kg`;
  }, [order]);

  async function submit() {
    if (!order) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await createDispatch(order.order_id, {
        dispatch_date: dispatchDate,
        dispatch_weight: dispatchWeight,
        transport: transport.trim() || undefined,
        tally_bill_nos: tallyBillsInput
          .split(/[\n,]+/g)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setOrder(updated[0] ?? order);
      const list = await fetchDispatch(order.order_id);
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
              options={woOptions}
              loading={loadingOrders}
              value={order}
              onChange={(_, v) => setOrder(v)}
              getOptionLabel={(o) => `${o.wo_no} • ${o.client_name} • ${o.item} ${o.size} ${o.grade}`}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select WO"
                  placeholder="Search WO / client…"
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
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

