import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "@/test/renderWithProviders";
import { server } from "@/test/server";
import { OAUTH_CODE, googleCallbackIs } from "@/test/handlers";
import { AuthProvider } from "@/context/AuthContext";
import { OAuthCallbackPage } from "./OAuthCallbackPage";

// D3: the SPA half of the OAuth flow. Google redirects the browser here with
// ?code; the page exchanges it against the API and routes by outcome. All four
// outcomes plus the two failure shapes are driven through the HTTP boundary.

const renderPage = (
  route = `/oauth/callback?code=${OAUTH_CODE}&state=test-state`,
) =>
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="/dashboard" element={<div>Dashboard landing</div>} />
        <Route path="/mfa-verify" element={<div>MFA challenge page</div>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </AuthProvider>,
    { route },
  );

describe("OAuthCallbackPage", () => {
  it("lands on the dashboard after a logged-in outcome", async () => {
    renderPage();

    expect(await screen.findByText("Dashboard landing")).toBeInTheDocument();
  });

  it("routes an mfa_required outcome to the challenge page", async () => {
    server.use(googleCallbackIs({ mfa_required: true }));

    renderPage();

    expect(await screen.findByText("MFA challenge page")).toBeInTheDocument();
  });

  it("asks for the account password when linking is needed, then signs in", async () => {
    const user = userEvent.setup();
    server.use(
      googleCallbackIs({ needs_linking: true, email: "owner@example.com" }),
    );

    renderPage();

    expect(
      await screen.findByText(/An account already exists for/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Password"), "Password1");
    await user.click(screen.getByRole("button", { name: "Link and sign in" }));

    expect(await screen.findByText("Dashboard landing")).toBeInTheDocument();
  });

  it("shows a failure state when Google returned no code", async () => {
    renderPage("/oauth/callback?error=access_denied");

    expect(await screen.findByText("Sign-in failed")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toBeInTheDocument();
  });

  it("surfaces the API's rejection of the exchange", async () => {
    server.use(googleCallbackIs(null));

    renderPage();

    expect(
      await screen.findByText("Invalid state parameter"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toBeInTheDocument();
  });
});
