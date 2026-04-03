import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { fetchDashboardSummary, fetchOrders, fetchPurchaseLedger, patchOpeningStock } from "../lib/api";
import type { OrderRow, PurchaseLedgerRow } from "../lib/api";

export function InventoryPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchDashboardSummary>> | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseLedgerRow[]>([]);
  const [openingDialog, setOpeningDialog] = useState(false);
  const [openingInput, setOpeningInput] = useState<number>(0);
  const [savingOpening, setSavingOpening] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchDashboardSummary(), fetchOrders(), fetchPurchaseLedger()])
      .then(([s, o, p]) => {
        if (!alive) return;
        setSummary(s);
        setOpeningInput(s.opening_stock_kgs ?? 0);
        setOrders(o);
        setPurchases(p);
        setErr(null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const calc = useMemo(() => {
    const opening = summary?.opening_stock_kgs ?? 0;
    const purchase = purchases.reduce((s, r) => s + r.weight, 0);
    const dispatch = orders.reduce((s, r) => s + r.dispatch_weight, 0);
    const returns = orders.reduce((s, r) => s + r.sales_return, 0);
    const stock = opening + purchase - dispatch - returns;
    return { opening, purchase, dispatch, returns, stock };
  }, [orders, purchases, summary?.opening_stock_kgs]);

  const negative = calc.stock < -0.0001;

  async function saveOpening() {
    setSavingOpening(true);
    setErr(null);
    try {
      await patchOpeningStock(Math.max(0, Number(openingInput) || 0));
      const s = await fetchDashboardSummary();
      setSummary(s);
      setOpeningInput(s.opening_stock_kgs ?? 0);
      setOpeningDialog(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save opening stock");
    } finally {
      setSavingOpening(false);
    }
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={900}>
          Inventory
        </Typography>
        <Button
          variant="outlined"
          onClick={() => {
            setOpeningInput(summary?.opening_stock_kgs ?? 0);
            setOpeningDialog(true);
          }}
        >
          Set opening stock (kg)
        </Button>
      </Stack>

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
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography fontWeight={900} sx={{ mb: 1 }}>
                Overview
              </Typography>
              <Typography color="text.secondary">
                Current Stock = Opening + Purchase − Dispatch − Sales Return
              </Typography>
              <Typography sx={{ mt: 1 }}>
                Opening: <b>{Math.round(calc.opening)} kg</b> • Purchase: <b>{Math.round(calc.purchase)} kg</b> • Dispatch:{" "}
                <b>{Math.round(calc.dispatch)} kg</b> • Returns: <b>{Math.round(calc.returns)} kg</b>
              </Typography>
              <Typography sx={{ mt: 0.5 }}>
                Current Stock:{" "}
                <b style={{ color: negative ? "#dc2626" : undefined }}>{Math.round(summary?.current_stock_kgs ?? calc.stock)} kg</b>
              </Typography>
              {negative ? (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Stock is negative. Next step: show product-wise breakdown + drill-down to transactions causing it.
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </Stack>
      )}

      <Dialog open={openingDialog} onClose={() => !savingOpening && setOpeningDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Opening stock</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Total kg on hand before you started recording purchases and dispatches in this system. This is added to the
            stock formula on the dashboard.
          </Typography>
          <TextField
            label="Opening stock (kg)"
            type="number"
            fullWidth
            value={openingInput || ""}
            onChange={(e) => setOpeningInput(Number(e.target.value))}
            inputProps={{ min: 0, step: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpeningDialog(false)} disabled={savingOpening}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveOpening} disabled={savingOpening}>
            {savingOpening ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

