import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { testAdmins, url } from "@/test/handlers";
import { renderWithProviders } from "@/test/renderWithProviders";
import { AdminAuthProvider } from "../context/AdminAuthContext";
import { AdminMfaVerifyPage } from "./AdminMfaVerifyPage";

// Admin mirror of MfaVerifyPage.test: the same arm-flag guard, the same
// flash-to-login hazard between a successful verify and the landing page.
const loginMounted = vi.fn();
function LoginProbe() {
  loginMounted();
  return <div>Admin login screen</div>;
}

const renderVerifyPage = () =>
  renderWithProviders(
    <AdminAuthProvider>
      <Routes>
        <Route path="/admin/mfa-verify" element={<AdminMfaVerifyPage />} />
        <Route path="/admin/login" element={<LoginProbe />} />
        <Route path="/admin" element={<div>Admin home</div>} />
      </Routes>
    </AdminAuthProvider>,
    { route: "/admin/mfa-verify" },
  );

const verifyOk = () =>
  HttpResponse.json({ status: "success", data: testAdmins.root });

describe("AdminMfaVerifyPage arm state", () => {
  beforeEach(() => {
    sessionStorage.clear();
    loginMounted.mockClear();
  });

  it("bounces to /admin/login when no challenge is in flight", async () => {
    renderVerifyPage();

    expect(await screen.findByText("Admin login screen")).toBeInTheDocument();
  });

  it.each([
    ["authenticator code", "login-verify", "Verification Code", "123456"],
    ["backup code", "login-backup", "Backup Code", "ABCD-1234"],
  ])(
    "a successful %s lands on the admin home without ever showing /admin/login",
    async (_label, endpoint, fieldLabel, code) => {
      server.use(http.post(url(`/admin/auth/mfa/${endpoint}`), verifyOk));
      sessionStorage.setItem("admin_mfa_pending", "1");
      const user = userEvent.setup();
      renderVerifyPage();
      await screen.findByText("Admin Two-Factor Authentication");

      if (endpoint === "login-backup") {
        await user.click(
          screen.getByRole("button", { name: "Use backup code instead" }),
        );
      }
      await user.type(screen.getByLabelText(fieldLabel), code);
      await user.click(screen.getByRole("button", { name: "Verify" }));

      expect(await screen.findByText("Admin home")).toBeInTheDocument();
      expect(loginMounted).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("admin_mfa_pending")).toBeNull();
    },
  );
});
