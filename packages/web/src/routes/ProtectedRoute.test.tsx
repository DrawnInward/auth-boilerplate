import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { renderWithProviders } from "@/test/renderWithProviders";
import { ProtectedRoute } from "./ProtectedRoute";

// Reports the state ProtectedRoute forwarded, so the redirect's payload is
// asserted through the router rather than by inspecting props.
function LoginScreen() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)
    ?.from;

  return <div>Login screen, came from: {from?.pathname ?? "nowhere"}</div>;
}

const renderAt = (
  route: string,
  props: { isAuthenticated: boolean; isLoading: boolean },
) =>
  renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<ProtectedRoute {...props} />}>
        <Route path="/dashboard" element={<div>Dashboard contents</div>} />
      </Route>
    </Routes>,
    { route },
  );

describe("ProtectedRoute", () => {
  it("renders the protected content when authenticated", () => {
    renderAt("/dashboard", { isAuthenticated: true, isLoading: false });

    expect(screen.getByText("Dashboard contents")).toBeInTheDocument();
  });

  it("waits rather than redirecting while auth is still resolving", () => {
    // Redirecting during the loading window is the classic bug here: a
    // logged-in user gets bounced to /login on every refresh.
    renderAt("/dashboard", { isAuthenticated: false, isLoading: true });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/Login screen/)).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard contents")).not.toBeInTheDocument();
  });

  it("redirects to login when unauthenticated", () => {
    renderAt("/dashboard", { isAuthenticated: false, isLoading: false });

    expect(screen.getByText(/Login screen/)).toBeInTheDocument();
    expect(screen.queryByText("Dashboard contents")).not.toBeInTheDocument();
  });

  it("tells login where the user was headed, so it can return them", () => {
    renderAt("/dashboard", { isAuthenticated: false, isLoading: false });

    expect(
      screen.getByText("Login screen, came from: /dashboard"),
    ).toBeInTheDocument();
  });
});
