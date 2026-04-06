import { useEffect, useState } from "react";
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
import { fetchDashboardSummary, patchMinimumStock, patchOpeningStock } from "../lib/api";

export function InventoryPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchDashboardSummary>> | null>(null);
  const [openingDialog, setOpeningDialog] = useState(false);
  const [openingInput, setOpeningInput] = useState<number>(0);
  const [savingOpening, setSavingOpening] = useState(false);
  const [minimumDialog, setMinimumDialog] = useState(false);
  const [minimumInput, setMinimumInput] = useState<number>(0);
  const [savingMinimum, setSavingMinimum] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDashboardSummary()
      .then((s) => {
        if (!alive) return;
        setSummary(s);
        setOpeningInput(s.opening_stock_kgs ?? 0);
        setMinimumInput(s.minimum_stock_kgs ?? 0);
        setErr(null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const negative = (summary?.current_stock_kgs ?? 0) < -0.0001;

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

  async function saveMinimum() {
    setSavingMinimum(true);
    setErr(null);
    try {
      await patchMinimumStock(Math.max(0, Number(minimumInput) || 0));
      const s = await fetchDashboardSummary();
      setSummary(s);
      setMinimumInput(s.minimum_stock_kgs ?? 0);
      setMinimumDialog(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save minimum stock");
    } finally {
      setSavingMinimum(false);
    }
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={900}>
          Inventory
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={() => {
              setOpeningInput(summary?.opening_stock_kgs ?? 0);
              setOpeningDialog(true);
            }}
          >
            Set opening stock (kg)
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setMinimumInput(summary?.minimum_stock_kgs ?? 0);
              setMinimumDialog(true);
            }}
          >
            Set minimum stock (kg)
          </Button>
        </Stack>
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
              <Typography color="text.secondary">Purchase Required uses your formula (with receipts/dispatch/returns).</Typography>
              <Typography sx={{ mt: 1 }}>
                Minimum stock: <b>{Math.round(summary?.minimum_stock_kgs ?? 0)} kg</b> • Purchase required:{" "}
                <b>{Math.round(summary?.purchase_required_kgs ?? 0)} kg</b>
              </Typography>
              <Typography sx={{ mt: 0.5 }}>
                Current stock: <b style={{ color: negative ? "#dc2626" : undefined }}>{Math.round(summary?.current_stock_kgs ?? 0)} kg</b>
              </Typography>
              {summary?.breakdown ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Pending sales {Math.round(summary.breakdown.pending_sales_orders_kgs)} kg • Pending PO{" "}
                  {Math.round(summary.breakdown.pending_purchase_orders_kgs)} kg • Receipts{" "}
                  {Math.round(summary.breakdown.incoming_material_kgs)} kg • Dispatch{" "}
                  {Math.round(summary.breakdown.dispatch_kgs)} kg • Sales return{" "}
                  {Math.round(summary.breakdown.dispatch_return_kgs)} kg • Purchase return{" "}
                  {Math.round(summary.breakdown.incoming_rm_return_kgs)} kg
                </Typography>
              ) : null}
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

      <Dialog open={minimumDialog} onClose={() => !savingMinimum && setMinimumDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Minimum stock</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Minimum stock buffer (kg) used in Purchase Required computation.
          </Typography>
          <TextField
            label="Minimum stock (kg)"
            type="number"
            fullWidth
            value={minimumInput || ""}
            onChange={(e) => setMinimumInput(Number(e.target.value))}
            inputProps={{ min: 0, step: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMinimumDialog(false)} disabled={savingMinimum}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveMinimum} disabled={savingMinimum}>
            {savingMinimum ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

