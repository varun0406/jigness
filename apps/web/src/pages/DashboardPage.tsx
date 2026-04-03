import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Typography,
  Alert,
} from "@mui/material";
import { fetchDashboardSummary } from "../lib/api";

function KpiCard(props: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary" fontWeight={700}>
          {props.label}
        </Typography>
        <Typography variant="h5" fontWeight={900} sx={{ mt: 0.5 }}>
          {props.value}
        </Typography>
        {props.sub ? (
          <Typography variant="caption" color="text.secondary">
            {props.sub}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDashboardSummary>> | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDashboardSummary()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setErr(null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const kpis = useMemo(() => {
    if (!data) return null;
    return {
      totalOrders: String(data.total_orders.c),
      totalOrderKgs: `${Math.round(data.total_order_kgs).toLocaleString()} kg`,
      totalDispatch: `${Math.round(data.total_dispatch_kgs).toLocaleString()} kg`,
      currentStock: `${Math.round(data.current_stock_kgs).toLocaleString()} kg`,
      pending: `${Math.round(data.pending_kgs).toLocaleString()} kg`,
    };
  }, [data]);

  return (
    <Box>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>
        Dashboard
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {kpis ? (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(4, 1fr)",
            },
          }}
        >
          <KpiCard label="Total Orders" value={kpis.totalOrders} sub="Count of WO" />
          <KpiCard label="Total Orders (Kgs)" value={kpis.totalOrderKgs} />
          <KpiCard label="Total Dispatch" value={kpis.totalDispatch} />
          <KpiCard label="Current Stock" value={kpis.currentStock} sub="Purchase − Dispatch − Return" />
          <KpiCard label="Pending Orders" value={kpis.pending} sub="Sum of balance" />
        </Box>
      ) : null}
    </Box>
  );
}

