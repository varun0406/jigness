import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  TextField,
  Typography,
} from "@mui/material";
import { api, fetchAuthStatus, registerFirstAdmin } from "../lib/api";
import { setAuthToken } from "../lib/auth";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [canBootstrap, setCanBootstrap] = useState(false);
  const [bootUser, setBootUser] = useState("");
  const [bootPass, setBootPass] = useState("");
  const [bootErr, setBootErr] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(false);

  useEffect(() => {
    fetchAuthStatus()
      .then((s) => setCanBootstrap(s.can_bootstrap))
      .catch(() => setCanBootstrap(false));
  }, []);

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

  async function onBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setBootErr(null);
    setBootLoading(true);
    try {
      const res = await registerFirstAdmin({ username: bootUser.trim(), password: bootPass });
      setAuthToken(res.token);
      window.location.assign("/");
    } catch {
      setBootErr("Could not create the first admin. Check password length (6+) and try again.");
    } finally {
      setBootLoading(false);
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
      <Card sx={{ maxWidth: 440, width: "100%" }}>
        <CardContent sx={{ p: 3 }}>
          <Typography fontWeight={900} variant="h5" gutterBottom>
            Jigness ERP
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sign in to continue
          </Typography>

          {canBootstrap ? (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                No database users yet. Create the <b>first admin account</b> below (one-time). After that, admins can add more users from{" "}
                <b>Users</b> in the sidebar.
              </Alert>
              {bootErr ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {bootErr}
                </Alert>
              ) : null}
              <Box component="form" onSubmit={onBootstrap}>
                <TextField
                  fullWidth
                  label="Admin username"
                  value={bootUser}
                  onChange={(e) => setBootUser(e.target.value)}
                  margin="normal"
                  required
                />
                <TextField
                  fullWidth
                  label="Admin password"
                  type="password"
                  value={bootPass}
                  onChange={(e) => setBootPass(e.target.value)}
                  margin="normal"
                  required
                />
                <Button type="submit" fullWidth variant="contained" size="large" sx={{ mt: 2 }} disabled={bootLoading}>
                  {bootLoading ? "Creating…" : "Create first admin & sign in"}
                </Button>
              </Box>
              <Divider sx={{ my: 3 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Or sign in with the configured environment user (if any):
              </Typography>
            </>
          ) : null}

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
