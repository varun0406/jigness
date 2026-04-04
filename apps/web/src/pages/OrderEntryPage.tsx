import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import dayjs from "dayjs";
import { createOrder, fetchClients, fetchProducts } from "../lib/api";
import type { CreateOrderLine, MasterClient, MasterProduct, OrderRow } from "../lib/api";

type LineDraft = CreateOrderLine & { input_text?: string };

const emptyLine = (): LineDraft => ({
  size: "",
  item: "",
  grade: "",
  length_nos: "",
  order_kgs: 0,
  bill_rate: 0,
  input_text: "",
});

export function OrderEntryPage() {
  const [clients, setClients] = useState<MasterClient[]>([]);
  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const [woNo, setWoNo] = useState("");
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [client, setClient] = useState<MasterClient | null>(null);
  const [clientText, setClientText] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const [created, setCreated] = useState<OrderRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchClients(), fetchProducts()])
      .then(([c, p]) => {
        setClients(c);
        setProducts(p);
        setErr(null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load masters"))
      .finally(() => setLoading(false));
  }, []);

  const resolvedClientName = useMemo(() => (client ? client.name : clientText.trim()), [client, clientText]);

  function applyProductToLine(index: number, prod: MasterProduct | null, text: string) {
    setLines((prev) => {
      const next = [...prev];
      if (prod) {
        next[index] = { ...next[index], size: prod.size, item: prod.item, grade: prod.grade, input_text: `${prod.item} | ${prod.size} | ${prod.grade}` };
      } else {
        next[index] = { ...next[index], input_text: text };
        if (!text.trim()) {
          next[index] = { ...next[index], size: "", item: "", grade: "" };
        } else {
          const parts = text.split("|").map((s) => s.trim());
          next[index] = {
            ...next[index],
            item: parts[0] || "",
            size: parts[1] || "",
            grade: parts[2] || "",
          };
        }
      }
      return next;
    });
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  async function submit() {
    if (!resolvedClientName.trim()) return;
    const clean: CreateOrderLine[] = lines
      .map((l) => ({
        size: l.size.trim(),
        item: l.item.trim(),
        grade: l.grade.trim(),
        length_nos: l.length_nos?.trim() || undefined,
        order_kgs: Number(l.order_kgs),
        bill_rate: Number(l.bill_rate) || 0,
      }))
      .filter((l) => l.item && l.order_kgs > 0);

    if (clean.length === 0) {
      setErr("Add at least one line with product item and order weight > 0.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const rows = await createOrder({
        wo_no: woNo.trim(),
        order_date: date,
        client_name: resolvedClientName,
        lines: clean,
      });
      setCreated(rows);
      setWoNo("");
      setLines([emptyLine()]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setSaving(false);
    }
  }

  const totalKgs = useMemo(() => lines.reduce((s, l) => s + (Number(l.order_kgs) || 0), 0), [lines]);

  return (
    <Box>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>
        Create Order
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        One WO can include many line items. Set <b>BILL RATE</b> and <b>AVE</b> per line (you can edit later in Orders).
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      {created && created.length > 0 ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          Created {created[0].wo_no} — {created.length} line(s),{" "}
          {Math.round(created.reduce((s, r) => s + r.order_kgs, 0))} kg total
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="WO Number"
                value={woNo}
                onChange={(e) => setWoNo(e.target.value)}
                placeholder="WO-1003"
                fullWidth
              />
              <TextField
                label="Order date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>

            <Autocomplete
              options={clients}
              loading={loading}
              value={client}
              inputValue={clientText}
              onInputChange={(_, v) => setClientText(v)}
              onChange={(_, v) => setClient(typeof v === "string" ? null : v)}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
              renderInput={(params) => <TextField {...params} label="Client name" placeholder="Type or select" />}
              freeSolo
            />

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography fontWeight={800}>Line items</Typography>
              <Button startIcon={<AddIcon />} size="small" onClick={() => setLines((p) => [...p, emptyLine()])}>
                Add item
              </Button>
            </Stack>

            {lines.map((line, index) => (
              <Box
                key={index}
                sx={{
                  border: "1px solid rgba(15,23,42,0.12)",
                  borderRadius: 2,
                  p: 2,
                }}
              >
                <Stack spacing={1.5}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" fontWeight={800}>
                      Item {index + 1}
                    </Typography>
                    {lines.length > 1 ? (
                      <IconButton size="small" aria-label="remove line" onClick={() => setLines((p) => p.filter((_, i) => i !== index))}>
                        <DeleteOutlineIcon />
                      </IconButton>
                    ) : null}
                  </Stack>
                  <Autocomplete
                    options={products}
                    loading={loading}
                    value={
                      line.item && line.size && line.grade
                        ? ({ id: -1, size: line.size, item: line.item, grade: line.grade, avg_cost: 0 } as MasterProduct)
                        : null
                    }
                    inputValue={line.input_text ?? ""}
                    onInputChange={(_, v) => {
                      applyProductToLine(index, null, v);
                    }}
                    onChange={(_, v) => {
                      if (v && typeof v === "object") applyProductToLine(index, v, "");
                      else applyProductToLine(index, null, typeof v === "string" ? v : "");
                    }}
                    getOptionLabel={(o) => (typeof o === "string" ? o : `${o.item} | ${o.size} | ${o.grade}`)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Product (Item | Size | Grade)"
                        placeholder="e.g. Copper Rod | 8mm | ETP"
                      />
                    )}
                    freeSolo
                  />
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      label="Length / Nos"
                      value={line.length_nos ?? ""}
                      onChange={(e) => updateLine(index, { length_nos: e.target.value })}
                      fullWidth
                    />
                    <TextField
                      label="Order weight (kg)"
                      type="number"
                      value={line.order_kgs || ""}
                      onChange={(e) => updateLine(index, { order_kgs: Number(e.target.value) })}
                      fullWidth
                    />
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      label="BILL RATE"
                      type="number"
                      value={line.bill_rate || ""}
                      onChange={(e) => updateLine(index, { bill_rate: Number(e.target.value) })}
                      fullWidth
                    />
                  </Stack>
                </Stack>
              </Box>
            ))}

            <Typography variant="body2" color="text.secondary">
              Total order weight: <b>{totalKgs.toLocaleString()}</b> kg
            </Typography>

            <Box>
              <Button
                variant="contained"
                onClick={submit}
                disabled={saving || !woNo.trim() || !resolvedClientName.trim()}
              >
                {saving ? "Saving…" : "Create order"}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
