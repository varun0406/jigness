import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
  const [selectedWO, setSelectedWO] = useState<{
    order_id: number;
    wo_no: string;
    client_name: string;
    order_date: string;
  } | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);

  const [dispatchDate, setDispatchDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [dispatchWeight, setDispatchWeight] = useState<number>(0);
  const [dispatchPcs, setDispatchPcs] = useState<number>(0);
  const [bundleNo, setBundleNo] = useState("");
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
    if (!order) {
      setEntries([]);
      return;
    }
    setLoadingEntries(true);
    fetchDispatchForLine(order.id)
      .then(setEntries)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load dispatch entries"))
      .finally(() => setLoadingEntries(false));
  }, [order]);

  const uniqueWorkOrders = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{
      order_id: number;
      wo_no: string;
      client_name: string;
      order_date: string;
    }> = [];
    for (const o of orders) {
      const key = `${o.order_id}-${o.wo_no}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          order_id: o.order_id,
          wo_no: o.wo_no || "N/A",
          client_name: o.client_name,
          order_date: o.order_date,
        });
      }
    }
    return list.sort((a, b) => b.wo_no.localeCompare(a.wo_no));
  }, [orders]);

  const selectedWOLines = useMemo(() => {
    if (!selectedWO) return [];
    return orders.filter((o) => o.order_id === selectedWO.order_id);
  }, [selectedWO, orders]);

  const helper = useMemo(() => {
    if (!order) return null;
    const dispatched = entries.reduce((s, e) => s + (Number(e.dispatch_weight) || 0), 0);
    const bal = Math.max(0, Number(order.order_kgs) - dispatched);
    const maxAllowed = Number(order.order_kgs) + 300;
    const dispatchedPcsSum = entries.reduce((s, e) => s + (Number(e.dispatch_pcs) || 0), 0);
    const balPcs = Math.max(0, Number(order.order_pcs || 0) - dispatchedPcsSum);
    return `Line ordered: ${Math.round(order.order_kgs)} kg / ${Math.round(order.order_pcs || 0)} pcs • Dispatched (this line): ${Math.round(dispatched)} kg / ${Math.round(dispatchedPcsSum)} pcs • Balance: ${Math.round(bal)} kg / ${Math.round(balPcs)} pcs • Max allowed: ${Math.round(maxAllowed)} kg`;
  }, [order, entries]);

  async function submit() {
    if (!order) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await createDispatchForLine(order.id, {
        dispatch_date: dispatchDate,
        dispatch_weight: dispatchWeight,
        dispatch_pcs: dispatchPcs,
        bundle_no: bundleNo.trim() || undefined,
        transport: transport.trim() || undefined,
        tally_bill_nos: tallyBillsInput
          .split(/[\n,]+/g)
          .map((s) => s.trim())
          .filter(Boolean),
      });

      // Update the orders state with the returned updated lines so that the list updates on UI
      setOrders(prev => {
        return prev.map(oldRow => {
          const matchingUpdated = updated.find(u => u.id === oldRow.id);
          return matchingUpdated ? matchingUpdated : oldRow;
        });
      });

      setOrder(updated.find(u => u.id === order.id) ?? updated[0] ?? order);
      const list = await fetchDispatchForLine(order.id);
      setEntries(list);
      setDispatchWeight(0);
      setDispatchPcs(0);
      setBundleNo("");
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
          <Stack spacing={2.5}>
            <Autocomplete
              options={uniqueWorkOrders}
              loading={loadingOrders}
              value={selectedWO}
              onChange={(_, v) => {
                setSelectedWO(v);
                setOrder(null);
              }}
              getOptionLabel={(o) => `${o.wo_no} • ${o.client_name}`}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Work Order"
                  placeholder="Search WO number or client name…"
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

            {selectedWO ? (
              <Box sx={{ border: "1px solid rgba(0, 0, 0, 0.08)", borderRadius: 2, p: 2, bgcolor: "rgba(0, 0, 0, 0.01)" }}>
                <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ mb: 1.5 }}>
                  Select Line Item for Work Order: {selectedWO.wo_no}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                  {selectedWOLines.map((line) => {
                    const isSelected = order?.id === line.id;
                    const balanceKgs = line.balance_kgs ?? (line.order_kgs - (line.dispatch_weight || 0));
                    const balancePcs = line.balance_pcs ?? (line.order_pcs - (line.dispatch_pcs || 0));
                    const isCompleted = balanceKgs <= 0;

                    return (
                      <Box
                        key={line.id}
                        onClick={() => setOrder(line)}
                        sx={{
                          cursor: "pointer",
                          border: "2px solid",
                          borderColor: isSelected ? "primary.main" : "rgba(0, 0, 0, 0.08)",
                          borderRadius: 2,
                          p: 1.5,
                          backgroundColor: isSelected ? "rgba(25, 118, 210, 0.04)" : "background.paper",
                          transition: "all 0.2s",
                          "&:hover": {
                            borderColor: isSelected ? "primary.main" : "text.secondary",
                            boxShadow: 1,
                          },
                        }}
                      >
                        <Stack spacing={1}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="subtitle2" fontWeight={800} color={isSelected ? "primary.main" : "text.primary"}>
                              {line.item} {line.size} {line.grade}
                            </Typography>
                            {isCompleted ? (
                              <Chip label="Completed" color="success" size="small" variant="filled" sx={{ height: 20, fontSize: "0.7rem" }} />
                            ) : (
                              <Chip label="Pending" color="warning" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                            )}
                          </Stack>

                          {line.length_nos && (
                            <Typography variant="caption" color="text.secondary">
                              Length/Specs: {line.length_nos}
                            </Typography>
                          )}

                          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, pt: 1, borderTop: "1px dashed rgba(0,0,0,0.06)" }}>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", display: "block" }}>
                                WEIGHT (KG)
                              </Typography>
                              <Typography variant="caption" sx={{ display: "block" }}>
                                Ordered: {Math.round(line.order_kgs)}
                              </Typography>
                              <Typography variant="caption" sx={{ display: "block", color: "success.main" }}>
                                Dispatched: {Math.round(line.dispatch_weight || 0)}
                              </Typography>
                              <Typography variant="caption" sx={{ fontWeight: 800, color: isCompleted ? "success.main" : "warning.main", display: "block" }}>
                                Balance: {Math.round(balanceKgs)}
                              </Typography>
                            </Box>

                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", display: "block" }}>
                                PIECES
                              </Typography>
                              <Typography variant="caption" sx={{ display: "block" }}>
                                Ordered: {Math.round(line.order_pcs || 0)}
                              </Typography>
                              <Typography variant="caption" sx={{ display: "block", color: "success.main" }}>
                                Dispatched: {Math.round(line.dispatch_pcs || 0)}
                              </Typography>
                              <Typography variant="caption" sx={{ fontWeight: 800, color: isCompleted ? "success.main" : "warning.main", display: "block" }}>
                                Balance: {Math.round(balancePcs)}
                              </Typography>
                            </Box>
                          </Box>
                        </Stack>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            ) : (
              <Alert severity="info" sx={{ py: 0.5 }}>
                Please select a Work Order above to display line items.
              </Alert>
            )}

            {selectedWO && !order && (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                Please click on a line item above to enter dispatch details.
              </Alert>
            )}

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Dispatch date"
                type="date"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
                disabled={!order || saving}
              />
              <TextField
                label="Dispatch weight (kg)"
                type="number"
                value={dispatchWeight || ""}
                onChange={(e) => setDispatchWeight(Number(e.target.value))}
                helperText={helper ?? " "}
                fullWidth
                disabled={!order || saving}
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Dispatch pieces"
                type="number"
                value={dispatchPcs || ""}
                onChange={(e) => setDispatchPcs(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                fullWidth
                disabled={!order || saving}
              />
              <TextField
                label="Bundle"
                value={bundleNo}
                onChange={(e) => setBundleNo(e.target.value)}
                placeholder="Optional bundle / lot identifier"
                fullWidth
                disabled={!order || saving}
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Transport"
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
                placeholder="Transporter name"
                fullWidth
                disabled={!order || saving}
              />
              <TextField
                label="Tally bill no(s)"
                value={tallyBillsInput}
                onChange={(e) => setTallyBillsInput(e.target.value)}
                placeholder="Enter bill numbers separated by comma or new line"
                fullWidth
                disabled={!order || saving}
              />
            </Stack>

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
          <Typography fontWeight={800} sx={{ mb: 1.5 }}>
            Recent dispatch entries {order ? `(for ${order.item} ${order.size} ${order.grade})` : ""}
          </Typography>
          {loadingEntries ? (
            <CircularProgress size={22} />
          ) : !order ? (
            <Typography color="text.secondary">Select a line item to view its recent dispatches.</Typography>
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
                  <Typography>
                    {Math.round(e.dispatch_weight)} kg / {Math.round(e.dispatch_pcs || 0)} pcs
                  </Typography>
                  <Typography color="text.secondary">{e.bundle_no ?? "—"}</Typography>
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

