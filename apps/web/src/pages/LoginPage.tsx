import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../lib/api";
import { setAuthToken } from "../lib/auth";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await api.post<{ token: string }>("/auth/login", { username, password });
      setAuthToken(res.data.token);
      window.location.assign("/");
    } catch {
      setErr("Invalid username or password, or sign-in is not available.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Card sx={{ maxWidth: 400, width: "100%" }}>
        <CardContent sx={{ p: 3 }}>
          <Typography fontWeight={900} variant="h5" gutterBottom>
            Jigness ERP
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sign in to continue
          </Typography>
          {err ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          ) : null}
          <Box component="form" onSubmit={onSubmit}>
            <TextField
              fullWidth
              label="Username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
            />
            <Button type="submit" fullWidth variant="contained" size="large" sx={{ mt: 2 }} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
