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

type LineDraft = Omit<CreateOrderLine, "length_nos"> & {
  length: string;
  no_of_pieces: string;
};

function lengthNosFromParts(length: string, pieces: string): string | undefined {
  const L = length.trim();
  const P = pieces.trim();
  if (!L && !P) return undefined;
  if (L && P) return `${L} | ${P} pcs`;
  if (L) return L;
  return `${P} pcs`;
}

const emptyLine = (): LineDraft => ({
  size: "",
  item: "",
  grade: "",
  length: "",
  no_of_pieces: "",
  order_kgs: 0,
  bill_rate: 0,
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

  const itemOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.item);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);

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
        size: l.size.trim() || "-",
        item: l.item.trim(),
        grade: l.grade.trim() || "-",
        length_nos: lengthNosFromParts(l.length, l.no_of_pieces),
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

                  <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch">
                    <Box sx={{ flex: { md: "3 1 240px" }, minWidth: 0 }}>
                      <Autocomplete
                        options={itemOptions}
                        freeSolo
                        value={line.item || null}
                        inputValue={line.item}
                        onInputChange={(_, v) => {
                          const sizeOptions = products.filter((p) => p.item === v).map((p) => p.size);
                          updateLine(index, {
                            item: v,
                            size: line.size && sizeOptions.includes(line.size) ? line.size : "",
                            grade: "",
                          });
                        }}
                        onChange={(_, v) => {
                          if (typeof v === "string") return;
                        }}
                        renderInput={(params) => <TextField {...params} label="Item" required />}
                      />
                    </Box>
                    <Box sx={{ flex: { md: "1.2 1 140px" }, minWidth: 0 }}>
                      <Autocomplete
                        options={[...new Set(products.filter((p) => p.item === line.item).map((p) => p.size))].sort((a, b) => a.localeCompare(b))}
                        freeSolo
                        value={line.size || null}
                        inputValue={line.size}
                        onInputChange={(_, v) => updateLine(index, { size: v, grade: "" })}
                        renderInput={(params) => <TextField {...params} label="Size" />}
                      />
                    </Box>
                    <Box sx={{ flex: { md: "0 0 140px" }, width: { md: 140 }, maxWidth: { md: 160 } }}>
                      <Autocomplete
                        options={[...new Set(products.filter((p) => p.item === line.item && p.size === line.size).map((p) => p.grade))].sort((a, b) => a.localeCompare(b))}
                        freeSolo
                        value={line.grade || null}
                        inputValue={line.grade}
                        onInputChange={(_, v) => updateLine(index, { grade: v })}
                        renderInput={(params) => <TextField {...params} label="Grade" />}
                      />
                    </Box>
                  </Stack>

                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      label="Length"
                      value={line.length}
                      onChange={(e) => updateLine(index, { length: e.target.value })}
                      fullWidth
                      sx={{ flex: { md: 1 } }}
                    />
                    <TextField
                      label="No. of pieces"
                      value={line.no_of_pieces}
                      onChange={(e) => updateLine(index, { no_of_pieces: e.target.value })}
                      fullWidth
                      sx={{ flex: { md: 1 } }}
                    />
                    <TextField
                      label="Order weight (kg)"
                      type="number"
                      value={line.order_kgs || ""}
                      onChange={(e) => updateLine(index, { order_kgs: Number(e.target.value) })}
                      fullWidth
                      sx={{ flex: { md: "0 0 160px" }, maxWidth: { md: 200 } }}
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
              <Button variant="contained" onClick={submit} disabled={saving || !woNo.trim() || !resolvedClientName.trim()}>
                {saving ? "Saving…" : "Create order"}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
