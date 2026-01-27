import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import { AdminAuthProvider } from "@/features/admin/context/AdminAuthContext";
import { PublicLayout, ProtectedLayout, AdminLayout } from "@/components/layout";
import { useAuth } from "@/features/auth/context/AuthContext";
import { useAdminAuth } from "@/features/admin/context/AdminAuthContext";
import { ProtectedRoute, AdminRoute } from "@/routes";
import "./App.css";

// Auth pages
import {
  LoginPage,
  RegisterPage,
  MfaVerifyPage,
  VerifyEmailPage,
  CompleteRegistrationPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  ConfirmEmailChangePage,
} from "@/features/auth/pages";

// User pages
import { DashboardPage } from "@/features/dashboard/pages";
import { SettingsPage } from "@/features/settings/pages";
import { OrganizationsListPage, OrganizationDetailPage } from "@/features/organizations/pages";
import { AcceptInvitePage } from "@/features/invitations/pages";

// Admin pages
import {
  AdminLoginPage,
  AdminMfaVerifyPage,
  AdminDashboardPage,
  AdminUsersPage,
  AdminUserDetailPage,
  AdminOrgsPage,
  AdminOrgDetailPage,
} from "@/features/admin/pages";
import { Navigate } from "react-router-dom";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function UserRoutes() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  return (
    <Routes>
      {/* Public auth routes */}
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
        <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/confirm-email-change/:token" element={<ConfirmEmailChangePage />} />
        <Route path="/mfa-verify" element={<MfaVerifyPage />} />
        <Route path="/invitations/:token" element={<AcceptInvitePage />} />
      </Route>

      {/* Protected user routes */}
      <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} isLoading={isLoading} />}>
        <Route element={<ProtectedLayout user={user} onLogout={logout} />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/organizations" element={<OrganizationsListPage />} />
          <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
        </Route>
      </Route>

      {/* Redirect root */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* 404 fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AdminRoutes() {
  const { isLoading, isAuthenticated, logout } = useAdminAuth();

  return (
    <Routes>
      {/* Admin public routes */}
      <Route element={<PublicLayout />}>
        <Route path="login" element={<AdminLoginPage />} />
        <Route path="mfa-verify" element={<AdminMfaVerifyPage />} />
      </Route>

      {/* Admin protected routes */}
      <Route element={<AdminRoute isAuthenticated={isAuthenticated} isLoading={isLoading} />}>
        <Route element={<AdminLayout onLogout={logout} />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:id" element={<AdminUserDetailPage />} />
          <Route path="organizations" element={<AdminOrgsPage />} />
          <Route path="organizations/:id" element={<AdminOrgDetailPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

function AppContent() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={
          <AdminAuthProvider>
            <AdminRoutes />
          </AdminAuthProvider>
        }
      />
      <Route
        path="/*"
        element={
          <AuthProvider>
            <UserRoutes />
          </AuthProvider>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
