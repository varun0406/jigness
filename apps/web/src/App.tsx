import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.tsx";
import { AuthGate } from "./components/AuthGate.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { OrdersPage } from "./pages/OrdersPage.tsx";
import { OrderEntryPage } from "./pages/OrderEntryPage.tsx";
import { DispatchPage } from "./pages/DispatchPage.tsx";
import { PurchasePage } from "./pages/PurchasePage.tsx";
import { BillingPage } from "./pages/BillingPage.tsx";
import { InventoryPage } from "./pages/InventoryPage.tsx";
import { PaymentsPage } from "./pages/PaymentsPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { ReturnsPage } from "./pages/ReturnsPage.tsx";
import { UsersPage } from "./pages/UsersPage.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/new" element={<OrderEntryPage />} />
            <Route path="dispatch" element={<DispatchPage />} />
            <Route path="purchase" element={<PurchasePage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="returns" element={<ReturnsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
