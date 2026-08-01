import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { renderWithProviders } from "@/test/renderWithProviders";
import { AdminRoute } from "./AdminRoute";

// B6: mirrors ProtectedRoute.test.tsx — the admin guard must behave the same
// way, but bounce to the admin login, never the user one.
function AdminLoginScreen() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)
    ?.from;

  return (
    <div>Admin login screen, came from: {from?.pathname ?? "nowhere"}</div>
  );
}

const renderAt = (
  route: string,
  props: { isAuthenticated: boolean; isLoading: boolean },
) =>
  renderWithProviders(
    <Routes>
      <Route path="/admin/login" element={<AdminLoginScreen />} />
      <Route element={<AdminRoute {...props} />}>
        <Route path="/admin/users" element={<div>Admin contents</div>} />
      </Route>
    </Routes>,
    { route },
  );

describe("AdminRoute", () => {
  it("renders the admin content when authenticated", () => {
    renderAt("/admin/users", { isAuthenticated: true, isLoading: false });

    expect(screen.getByText("Admin contents")).toBeInTheDocument();
  });

  it("waits rather than redirecting while auth is still resolving", () => {
    renderAt("/admin/users", { isAuthenticated: false, isLoading: true });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/Admin login screen/)).not.toBeInTheDocument();
    expect(screen.queryByText("Admin contents")).not.toBeInTheDocument();
  });

  it("redirects to the admin login when unauthenticated", () => {
    renderAt("/admin/users", { isAuthenticated: false, isLoading: false });

    expect(screen.getByText(/Admin login screen/)).toBeInTheDocument();
    expect(screen.queryByText("Admin contents")).not.toBeInTheDocument();
  });

  it("tells the admin login where the user was headed", () => {
    renderAt("/admin/users", { isAuthenticated: false, isLoading: false });

    expect(
      screen.getByText("Admin login screen, came from: /admin/users"),
    ).toBeInTheDocument();
  });
});
