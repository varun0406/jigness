import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { fetchAuthSession, fetchAuthStatus, type AuthSession } from "../lib/api";
import { getAuthToken } from "../lib/auth";

export type { AuthSession };

export type AuthGateConfig = {
  enabled: boolean;
  can_bootstrap: boolean;
  has_db_users: boolean;
  session: AuthSession | null;
};

const AuthGateContext = createContext<AuthGateConfig>({
  enabled: false,
  can_bootstrap: false,
  has_db_users: false,
  session: null,
});

export function useAuthGate() {
  return useContext(AuthGateContext);
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Omit<AuthGateConfig, "session"> | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAuthStatus()
      .then((s) => {
        if (!alive) return;
        setStatus({
          enabled: s.enabled,
          can_bootstrap: s.can_bootstrap,
          has_db_users: s.has_db_users,
        });
      })
      .catch(() => {
        if (!alive) return;
        setStatus({ enabled: false, can_bootstrap: false, has_db_users: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!status?.enabled) {
      setSession(null);
      return;
    }
    const token = getAuthToken();
    if (!token) {
      setSession(null);
      return;
    }
    let alive = true;
    fetchAuthSession()
      .then((s) => {
        if (alive) setSession(s);
      })
      .catch(() => {
        if (alive) setSession(null);
      });
    return () => {
      alive = false;
    };
  }, [status?.enabled]);

  const value = useMemo<AuthGateConfig | null>(() => {
    if (!status) return null;
    return { ...status, session };
  }, [status, session]);

  if (!value) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <AuthGateContext.Provider value={value}>
      <AuthGateRoutes>{children}</AuthGateRoutes>
    </AuthGateContext.Provider>
  );
}

function AuthGateRoutes({ children }: { children: React.ReactNode }) {
  const cfg = useAuthGate();
  const location = useLocation();
  const token = getAuthToken();

  if (!cfg.enabled && location.pathname === "/login") {
    return <Navigate to="/" replace />;
  }
  if (cfg.enabled && !token && location.pathname !== "/login") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (cfg.enabled && token && location.pathname === "/login") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
