import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { api } from "../lib/api";
import { getAuthToken } from "../lib/auth";

type AuthConfig = { enabled: boolean };

const AuthConfigContext = createContext<AuthConfig>({ enabled: false });

export function useAuthConfig() {
  return useContext(AuthConfigContext);
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthConfig | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<AuthConfig>("/auth/status")
      .then((r) => {
        if (alive) setStatus(r.data);
      })
      .catch(() => {
        if (alive) setStatus({ enabled: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (status === null) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <AuthConfigContext.Provider value={status}>
      <AuthGateRoutes>{children}</AuthGateRoutes>
    </AuthConfigContext.Provider>
  );
}

function AuthGateRoutes({ children }: { children: React.ReactNode }) {
  const { enabled } = useAuthConfig();
  const location = useLocation();
  const token = getAuthToken();

  if (!enabled && location.pathname === "/login") {
    return <Navigate to="/" replace />;
  }
  if (enabled && !token && location.pathname !== "/login") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (enabled && token && location.pathname === "/login") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
