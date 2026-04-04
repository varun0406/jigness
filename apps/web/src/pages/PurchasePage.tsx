import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Drawer,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import dayjs from "dayjs";
import {
  createPurchase,
  createPurchaseReceipt,
  deletePurchase,
  fetchProducts,
  fetchPurchaseLedger,
  fetchPurchaseReceipts,
  patchPurchaseRecNote,
} from "../lib/api";
import type { MasterProduct, PurchaseLedgerRow, PurchaseReceiptRow } from "../lib/api";

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function PurchasePage() {
  const [tab, setTab] = useState(0);
  const [supplier, setSupplier] = useState("");
  const [poNo, setPoNo] = useState("");
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [weight, setWeight] = useState<number>(0);
  const [rate, setRate] = useState<number>(0);
  const [debitNote, setDebitNote] = useState("");
  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [rows, setRows] = useState<PurchaseLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [poForReceipt, setPoForReceipt] = useState<PurchaseLedgerRow | null>(null);
  const [recDate, setRecDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [recWeight, setRecWeight] = useState<number>(0);
  const [recNote, setRecNote] = useState("");

  const [drawerPo, setDrawerPo] = useState<PurchaseLedgerRow | null>(null);
  const [receiptLines, setReceiptLines] = useState<PurchaseReceiptRow[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const amountOrderedPreview = useMemo(() => weight * rate, [weight, rate]);

  /** Raw material line (same key as sales orders / products master) */
  const [poLine, setPoLine] = useState({ size: "", item: "", grade: "" });

  function productLabel(r: PurchaseLedgerRow) {
    if (r.item && r.size && r.grade) return `${r.item} • ${r.size} • ${r.grade}`;
    return "—";
  }

  const loadLedger = useCallback(() => {
    setLoading(true);
    fetchPurchaseLedger()
      .then(setRows)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    setLoadingProducts(true);
    fetchProducts()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, []);

  useEffect(() => {
    if (!drawerPo) return;
    setLoadingReceipts(true);
    fetchPurchaseReceipts(drawerPo.id)
      .then(setReceiptLines)
      .finally(() => setLoadingReceipts(false));
  }, [drawerPo?.id]);

  async function submitPo() {
    if (!poLine.item.trim()) {
      setErr("Select or enter raw material.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const created = await createPurchase({
        supplier_name: supplier.trim(),
        po_no: poNo.trim() || undefined,
        purchase_date: date,
        weight,
        rate,
        debit_note: debitNote.trim() || undefined,
        size: poLine.size.trim() || "-",
        item: poLine.item.trim(),
        grade: poLine.grade.trim() || "-",
      });
      setRows((prev) => [created, ...prev]);
      setSupplier("");
      setPoNo("");
      setWeight(0);
      setRate(0);
      setDebitNote("");
      setPoLine({ size: "", item: "", grade: "" });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function submitReceipt() {
    if (!poForReceipt) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await createPurchaseReceipt(poForReceipt.id, {
        receipt_date: recDate,
        weight_received: recWeight,
        note: recNote.trim() || undefined,
      });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setPoForReceipt(updated);
      setRecWeight(0);
      setRecNote("");
      if (drawerPo?.id === updated.id) {
        setDrawerPo(updated);
        setReceiptLines(await fetchPurchaseReceipts(updated.id));
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save receipt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 1 }}>
        Raw material — Purchase orders & receipts
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Create a PO first, then record each goods-in (received weight) against that PO. Balance = ordered − received.
        AVE on sales orders is the weighted purchase rate: Σ(receipt kg × PO rate) ÷ Σ(receipt kg) for that material.
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      ) : null}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="1. New purchase order (PO)" />
        <Tab label="2. Record receipt (what we received)" />
      </Tabs>

      {tab === 0 ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  label="Supplier (NAME)"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  fullWidth
                />
                <TextField label="PO NO" value={poNo} onChange={(e) => setPoNo(e.target.value)} fullWidth />
                <TextField
                  label="DATE"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Stack>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Autocomplete
                  options={products}
                  loading={loadingProducts}
                  getOptionLabel={(o) => typeof o === "string" ? o : o.item}
                  renderOption={(props, option) => (
                    <li {...props}>
                      {option.item} | {option.size} | {option.grade}
                    </li>
                  )}
                  value={null}
                  inputValue={poLine.item}
                  onInputChange={(_, v, reason) => {
                    if (reason !== "reset") setPoLine(prev => ({ ...prev, item: v }));
                  }}
                  onChange={(_, v) => {
                    if (v && typeof v === "object") {
                      setPoLine({ item: v.item, size: v.size, grade: v.grade });
                    }
                  }}
                  renderInput={(params) => <TextField {...params} label="Item (or select Product)" required />}
                  freeSolo
                  fullWidth
                  sx={{ flex: 2 }}
                />
                <TextField label="Size" value={poLine.size} onChange={(e) => setPoLine(prev => ({ ...prev, size: e.target.value }))} fullWidth />
                <TextField label="Grade" value={poLine.grade} onChange={(e) => setPoLine(prev => ({ ...prev, grade: e.target.value }))} fullWidth />
              </Stack>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  label="WEIGHT (ordered, kg)"
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  fullWidth
                />
                <TextField label="RATE" type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} fullWidth />
                <TextField
                  label="AMOUNT (order = wt × rate)"
                  value={money(amountOrderedPreview)}
                  disabled
                  fullWidth
                />
              </Stack>

              <TextField
                label="DEBIT NOTE (optional)"
                value={debitNote}
                onChange={(e) => setDebitNote(e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />

              <Box>
                <Button
                  variant="contained"
                  disabled={
                    saving ||
                    !supplier.trim() ||
                    weight <= 0 ||
                    !poLine.item.trim()
                  }
                  onClick={submitPo}
                >
                  {saving ? "Saving…" : "Save purchase order"}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack spacing={2}>
              <Autocomplete
                options={rows}
                value={poForReceipt}
                onChange={(_, v) => setPoForReceipt(v)}
                getOptionLabel={(r) =>
                  `${r.po_no ?? "PO"} • ${r.supplier_name} • ${productLabel(r)} • bal ${Math.round(r.balance_weight)} kg`
                }
                renderInput={(params) => <TextField {...params} label="Select PO" placeholder="Search…" />}
              />
              {poForReceipt ? (
                <Typography variant="body2" color="text.secondary">
                  Ordered {money(poForReceipt.weight)} kg • Received {money(poForReceipt.received_weight)} kg • Balance{" "}
                  <b>{money(poForReceipt.balance_weight)}</b> kg
                </Typography>
              ) : null}
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  label="Receipt DATE"
                  type="date"
                  value={recDate}
                  onChange={(e) => setRecDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  label="WEIGHT received (kg)"
                  type="number"
                  value={recWeight}
                  onChange={(e) => setRecWeight(Number(e.target.value))}
                  fullWidth
                />
                <TextField
                  label="Note (REC DATE / remarks)"
                  value={recNote}
                  onChange={(e) => setRecNote(e.target.value)}
                  fullWidth
                />
              </Stack>
              <Box>
                <Button
                  variant="contained"
                  disabled={saving || !poForReceipt || recWeight <= 0}
                  onClick={submitReceipt}
                >
                  {saving ? "Saving…" : "Add receipt"}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography fontWeight={800} sx={{ mb: 1 }}>
            Purchase orders ledger
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Click a row to see receipt lines. Columns match PO / WEIGHT / rec wt. / bal / RATE / amounts / supplier.
          </Typography>
          {loading ? (
            <CircularProgress size={22} />
          ) : rows.length === 0 ? (
            <Typography color="text.secondary">No purchase orders yet.</Typography>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns:
                    "100px 110px minmax(100px, 1fr) minmax(160px, 220px) 90px 90px 90px 80px 100px 110px 110px 120px 140px",
                  minWidth: 1480,
                  gap: 0.5,
                  alignItems: "center",
                  borderBottom: "1px solid rgba(15,23,42,0.1)",
                  py: 1,
                  px: 1,
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                <span>PO NO</span>
                <span>DATE</span>
                <span>NAME</span>
                <span>PRODUCT</span>
                <span>WEIGHT</span>
                <span>rec wt.</span>
                <span>bal wt.</span>
                <span>DEBIT</span>
                <span>RATE</span>
                <span>AMT ord</span>
                <span>AMT recvd</span>
                <span>REC NOTE</span>
                <span />
              </Box>
              {rows.map((r) => (
                <Box
                  key={r.id}
                  onClick={() => setDrawerPo(r)}
                  sx={{
                    display: "grid",
                    gridTemplateColumns:
                      "100px 110px minmax(100px, 1fr) minmax(160px, 220px) 90px 90px 90px 80px 100px 110px 110px 120px 140px",
                    minWidth: 1480,
                    gap: 0.5,
                    alignItems: "center",
                    border: "1px solid rgba(15,23,42,0.08)",
                    borderRadius: 1,
                    py: 1,
                    px: 1,
                    fontSize: 12.5,
                    cursor: "pointer",
                    "&:hover": { background: "rgba(37,99,235,0.04)" },
                  }}
                >
                  <span>{r.po_no ?? "—"}</span>
                  <span>{r.purchase_date}</span>
                  <span>{r.supplier_name}</span>
                  <span title={productLabel(r)} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {productLabel(r)}
                  </span>
                  <span>{money(r.weight)}</span>
                  <span>{money(r.received_weight)}</span>
                  <span style={{ color: r.balance_weight > 0.01 ? "#d97706" : undefined }}>{money(r.balance_weight)}</span>
                  <span title={r.debit_note ?? ""} style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.debit_note ? (r.debit_note.length > 14 ? `${r.debit_note.slice(0, 14)}…` : r.debit_note) : "—"}
                  </span>
                  <span>{money(r.rate)}</span>
                  <span>{money(r.amount_ordered)}</span>
                  <span style={{ color: r.amount_received > 0 ? "#16a34a" : undefined }}>{money(r.amount_received)}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.rec_note ?? "—"}
                  </span>
                  <Button size="small" variant="outlined" onClick={(e) => (e.stopPropagation(), setDrawerPo(r))}>
                    Receipts
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      <Drawer anchor="right" open={Boolean(drawerPo)} onClose={() => setDrawerPo(null)} PaperProps={{ sx: { width: 420 } }}>
        {drawerPo ? (
          <Box sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography fontWeight={900}>PO {drawerPo.po_no ?? drawerPo.id}</Typography>
              <Stack direction="row" spacing={1}>
                <IconButton color="error" size="small" onClick={async () => {
                  if (!window.confirm("Are you sure you want to delete this purchase order? All related receipts will be deleted.")) return;
                  setSaving(true);
                  try {
                    await deletePurchase(drawerPo.id);
                    setRows(prev => prev.filter(r => r.id !== drawerPo.id));
                    setDrawerPo(null);
                  } catch (e: unknown) {
                    setErr(e instanceof Error ? e.message : "Failed to delete");
                  } finally {
                    setSaving(false);
                  }
                }}>
                  <DeleteOutlineIcon />
                </IconButton>
                <IconButton size="small" onClick={() => setDrawerPo(null)}>
                  <CloseIcon />
                </IconButton>
              </Stack>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {drawerPo.supplier_name} • {drawerPo.purchase_date}
              {drawerPo.item ? ` • ${productLabel(drawerPo)}` : ""}
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Ordered <b>{money(drawerPo.weight)}</b> kg @ {money(drawerPo.rate)} → bal{" "}
              <b>{money(drawerPo.balance_weight)}</b> kg
            </Typography>
            <TextField
              label="REC NOTE (header for this PO)"
              value={drawerPo.rec_note ?? ""}
              onChange={(e) => setDrawerPo({ ...drawerPo, rec_note: e.target.value || null })}
              onBlur={async () => {
                const u = await patchPurchaseRecNote(drawerPo.id, drawerPo.rec_note);
                setRows((prev) => prev.map((x) => (x.id === u.id ? u : x)));
                setDrawerPo(u);
              }}
              fullWidth
              multiline
              minRows={2}
              size="small"
              sx={{ mb: 2 }}
            />
            <Typography fontWeight={800} sx={{ mb: 1 }}>
              Receipt lines (what we received)
            </Typography>
            {loadingReceipts ? (
              <CircularProgress size={22} />
            ) : receiptLines.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No receipts yet — use tab “Record receipt”.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {receiptLines.map((line) => (
                  <Box
                    key={line.id}
                    sx={{
                      border: "1px solid rgba(15,23,42,0.1)",
                      borderRadius: 1,
                      p: 1,
                      fontSize: 13,
                    }}
                  >
                    <b>{line.receipt_date}</b> — {money(line.weight_received)} kg
                    {line.note ? (
                      <Typography variant="caption" display="block" color="text.secondary">
                        {line.note}
                      </Typography>
                    ) : null}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        ) : null}
      </Drawer>
    </Box>
  );
}
