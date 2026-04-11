import {
  Box,
  Button,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import { Outlet, useNavigate } from "react-router-dom";
import { clearAuthToken } from "../lib/auth";
import { useAuthGate } from "./AuthGate.tsx";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import { Link, useLocation } from "react-router-dom";

const drawerWidth = 260;

const nav = [
  { to: "/", label: "Dashboard", icon: <DashboardOutlinedIcon /> },
  { to: "/orders", label: "Orders", icon: <TableChartOutlinedIcon /> },
  { to: "/orders/new", label: "Create Order", icon: <TableChartOutlinedIcon /> },
  { to: "/dispatch", label: "Dispatch", icon: <LocalShippingOutlinedIcon /> },
  { to: "/purchase", label: "Purchase (PO)", icon: <ShoppingCartOutlinedIcon /> },
  { to: "/billing", label: "Billing", icon: <ReceiptLongOutlinedIcon /> },
  { to: "/inventory", label: "Inventory", icon: <Inventory2OutlinedIcon /> },
  { to: "/payments", label: "Payments", icon: <PaymentsOutlinedIcon /> },
  { to: "/returns", label: "Returns", icon: <ReceiptLongOutlinedIcon /> },
  { to: "/users", label: "Users", icon: <PersonAddOutlinedIcon /> },
];

export function AppShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const authGate = useAuthGate();
  const authEnabled = authGate.enabled;
  const showUsersNav = authEnabled && authGate.session?.role === "admin";

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box" },
        }}
      >
        <Toolbar sx={{ px: 2, flexDirection: "column", alignItems: "stretch", gap: 1, py: 2 }}>
          <Box>
            <Typography fontWeight={900} lineHeight={1.1}>
              Jigness ERP
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Metals trading / manufacturing
            </Typography>
          </Box>
          {authEnabled ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<LogoutOutlinedIcon />}
              onClick={() => {
                clearAuthToken();
                navigate("/login", { replace: true });
              }}
            >
              Sign out
            </Button>
          ) : null}
        </Toolbar>
        <Divider />
        <List dense sx={{ px: 1, py: 1 }}>
          {nav
            .filter((n) => (n.to === "/users" ? showUsersNav : true))
            .map((n) => (
            <ListItemButton
              key={n.to}
              component={Link}
              to={n.to}
              selected={loc.pathname === n.to}
              sx={{ borderRadius: 2, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, px: 3, py: 2 }}>
        <Outlet />
      </Box>
    </Box>
  );
}

