import { describe, expect, it, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "@/test/renderWithProviders";
import { AuthProvider } from "@/context/AuthContext";
import { MfaVerifyPage } from "./MfaVerifyPage";

const renderVerifyPage = () =>
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/mfa-verify" element={<MfaVerifyPage />} />
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </AuthProvider>,
    { route: "/mfa-verify" },
  );

describe("MfaVerifyPage arm state", () => {
  beforeEach(() => {
    sessionStorage.clear();
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
});
