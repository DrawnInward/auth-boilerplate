import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { testUsers, url } from "@/test/handlers";
import { renderWithProviders } from "@/test/renderWithProviders";
import { AuthProvider } from "@/context/AuthContext";
import { MfaVerifyPage } from "./MfaVerifyPage";

// Records every mount of the /login route so a test can prove the page was
// never shown, not just that it isn't showing now.
const loginMounted = vi.fn();
function LoginProbe() {
  loginMounted();
  return <div>Login screen</div>;
}

const renderVerifyPage = () =>
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/mfa-verify" element={<MfaVerifyPage />} />
        <Route path="/login" element={<LoginProbe />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </AuthProvider>,
    { route: "/mfa-verify" },
  );

const verifyOk = () =>
  HttpResponse.json({ status: "success", data: testUsers.owner });

describe("MfaVerifyPage arm state", () => {
  beforeEach(() => {
    sessionStorage.clear();
    loginMounted.mockClear();
  });

  it("bounces to /login when no challenge is in flight", async () => {
    renderVerifyPage();

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  it("survives a page refresh mid-challenge (sessionStorage rehydration)", async () => {
    // What a refresh leaves behind: the httpOnly challenge cookie (invisible
    // to the FE) plus this flag — without the flag the user was bounced to
    // /login while their still-valid challenge sat unused.
    sessionStorage.setItem("mfa_pending", "1");

    renderVerifyPage();

    expect(
      await screen.findByText("Two-factor authentication"),
    ).toBeInTheDocument();
  });

  // The flag clear and the navigate must share one transition: cleared on
  // its own, the guard above bounced to /login while the `me` refetch was
  // still in flight, flashing the login form on the way to the dashboard.
  it.each([
    ["authenticator code", "login-verify", "Verification Code", "123456"],
    ["backup code", "login-backup", "Backup Code", "ABCD-1234"],
  ])(
    "a successful %s lands on the dashboard without ever showing /login",
    async (_label, endpoint, fieldLabel, code) => {
      server.use(http.post(url(`/auth/mfa/${endpoint}`), verifyOk));
      sessionStorage.setItem("mfa_pending", "1");
      const user = userEvent.setup();
      renderVerifyPage();
      await screen.findByText("Two-factor authentication");

      if (endpoint === "login-backup") {
        await user.click(
          screen.getByRole("button", { name: "Use backup code instead" }),
        );
      }
      await user.type(screen.getByLabelText(fieldLabel), code);
      await user.click(screen.getByRole("button", { name: "Verify" }));

      expect(await screen.findByText("Dashboard")).toBeInTheDocument();
      expect(loginMounted).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("mfa_pending")).toBeNull();
    },
  );
});
