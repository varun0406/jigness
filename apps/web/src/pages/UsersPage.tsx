import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { Navigate } from "react-router-dom";
import { createAppUser, deleteAppUser, fetchAppUsers } from "../lib/api";
import type { AppUserRow } from "../lib/api";
import { useAuthGate } from "../components/AuthGate.tsx";
import { getAuthToken } from "../lib/auth";

export function UsersPage() {
  const { enabled, session } = useAuthGate();
  const token = getAuthToken();
  const [rows, setRows] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");

  useEffect(() => {
    if (!enabled || !token || session?.role !== "admin") return;
    let alive = true;
    setLoading(true);
    fetchAppUsers()
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [enabled, token, session?.role]);

  if (enabled && token && !session) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!session || session.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  async function addUser() {
    setSaving(true);
    setErr(null);
    try {
      const u = await createAppUser({ username: newUser.trim(), password: newPass, role: newRole });
      setRows((prev) => [...prev, u].sort((a, b) => a.username.localeCompare(b.username)));
      setNewUser("");
      setNewPass("");
      setNewRole("user");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to add user");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this user?")) return;
    setSaving(true);
    setErr(null);
    try {
      await deleteAppUser(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>
        Users
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Admins can create additional sign-ins. Passwords are stored hashed on the server.
      </Typography>

      {err ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      ) : null}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography fontWeight={800} sx={{ mb: 2 }}>
            Add user
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-end" }}>
            <TextField label="Username" value={newUser} onChange={(e) => setNewUser(e.target.value)} fullWidth size="small" />
            <TextField
              label="Password"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              fullWidth
              size="small"
            />
            <TextField select label="Role" value={newRole} onChange={(e) => setNewRole(e.target.value as "admin" | "user")} size="small" sx={{ minWidth: 140 }}>
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </TextField>
            <Button variant="contained" onClick={addUser} disabled={saving || !newUser.trim() || newPass.length < 6}>
              Add
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Card>
          <CardContent>
            <Typography fontWeight={800} sx={{ mb: 2 }}>
              Existing users
            </Typography>
            <Stack spacing={1}>
              {rows.map((r) => (
                <Stack key={r.id} direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.5 }}>
                  <Box>
                    <Typography fontWeight={700}>{r.username}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.role} · {r.created_at}
                    </Typography>
                  </Box>
                  <IconButton size="small" color="error" aria-label="delete user" onClick={() => void remove(r.id)} disabled={saving}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
