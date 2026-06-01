import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { createDispatchForLine, fetchDispatch, fetchOrders } from "../lib/api";
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
  const [retainDetails, setRetainDetails] = useState(true);

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
    if (!selectedWO) {
      setEntries([]);
      return;
    }
    setLoadingEntries(true);
    fetchDispatch(selectedWO.order_id)
      .then(setEntries)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load dispatch entries"))
      .finally(() => setLoadingEntries(false));
  }, [selectedWO]);

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
    const dispatched = entries
      .filter((e) => e.order_line_item_id === order.id)
      .reduce((s, e) => s + (Number(e.dispatch_weight) || 0), 0);
    const bal = Math.max(0, Number(order.order_kgs) - dispatched);
    const maxAllowed = Number(order.order_kgs) + 300;
    const dispatchedPcsSum = entries
      .filter((e) => e.order_line_item_id === order.id)
      .reduce((s, e) => s + (Number(e.dispatch_pcs) || 0), 0);
    const balPcs = Math.max(0, Number(order.order_pcs || 0) - dispatchedPcsSum);
    return `Line ordered: ${Math.round(order.order_kgs)} kg / ${Math.round(order.order_pcs || 0)} pcs • Dispatched (this line): ${Math.round(dispatched)} kg / ${Math.round(dispatchedPcsSum)} pcs • Balance: ${Math.round(bal)} kg / ${Math.round(balPcs)} pcs • Max allowed: ${Math.round(maxAllowed)} kg`;
  }, [order, entries]);

  async function submit() {
    if (!order || !selectedWO) return;
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
      const list = await fetchDispatch(selectedWO.order_id);
      setEntries(list);
      setDispatchWeight(0);
      setDispatchPcs(0);
      setBundleNo("");
      if (!retainDetails) {
        setTransport("");
        setTallyBillsInput("");
      }
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

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" justifyContent="space-between">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={retainDetails}
                    onChange={(e) => setRetainDetails(e.target.checked)}
                    color="primary"
                    disabled={!order || saving}
                  />
                }
                label="Retain date, transport & bills after save"
                sx={{ userSelect: "none" }}
              />
              <Button variant="contained" disabled={!order || saving || dispatchWeight <= 0} onClick={submit}>
                {saving ? "Saving…" : "Add dispatch"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography fontWeight={800} sx={{ mb: 1.5 }}>
            Recent dispatch entries {selectedWO ? `(for Work Order: ${selectedWO.wo_no})` : ""}
          </Typography>
          {loadingEntries ? (
            <CircularProgress size={22} />
          ) : !selectedWO ? (
            <Typography color="text.secondary">Select a Work Order to view its recent dispatches.</Typography>
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
                    alignItems: "center",
                    border: "1px solid rgba(15,23,42,0.08)",
                    borderRadius: 2,
                    px: 1.5,
                    py: 1,
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ minWidth: 140 }}>
                    <Typography fontWeight={700} variant="body2">{e.dispatch_date}</Typography>
                    {e.item && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {e.item} {e.size} {e.grade}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body2">
                    {Math.round(e.dispatch_weight)} kg / {Math.round(e.dispatch_pcs || 0)} pcs
                  </Typography>
                  <Typography color="text.secondary" variant="body2">{e.bundle_no ?? "—"}</Typography>
                  <Typography color="text.secondary" variant="body2">{e.transport ?? "—"}</Typography>
                  <Typography color="text.secondary" variant="body2" sx={{ flexGrow: 1, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {e.tally_bill_nos && e.tally_bill_nos.length ? e.tally_bill_nos.join(", ") : "—"}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ textTransform: "none", py: 0.25, px: 1, fontSize: "0.75rem" }}
                    onClick={() => {
                      setDispatchDate(e.dispatch_date);
                      setDispatchWeight(e.dispatch_weight);
                      setDispatchPcs(e.dispatch_pcs);
                      setBundleNo(e.bundle_no || "");
                      setTransport(e.transport || "");
                      setTallyBillsInput(e.tally_bill_nos?.join(", ") || "");

                      if (e.order_line_item_id) {
                        const targetLine = orders.find(o => o.id === e.order_line_item_id);
                        if (targetLine) {
                          setOrder(targetLine);
                        }
                      }
                    }}
                  >
                    Duplicate
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

