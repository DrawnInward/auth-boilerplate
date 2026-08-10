import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "@/test/renderWithProviders";
import { server } from "@/test/server";
import {
  INVITE_TOKEN,
  ORG_ID,
  invitationIs,
  testInvitation,
  url,
} from "@/test/handlers";
import { MfaVerifyPage } from "@/features/auth/pages";
import { AuthProvider } from "@/context/AuthContext";
import { AcceptInvitePage } from "./AcceptInvitePage";

// B6: the invitation-accept flow — the one path a brand-new user takes into
// the product. The invitation itself, its error states, and the accept
// submission are all driven through the HTTP boundary.

const renderPage = () =>
  renderWithProviders(
    // AuthProvider mirrors production (the page arms the MFA gate through
    // useAuth on an mfa_required accept).
    <AuthProvider>
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route
          path={`/organizations/${ORG_ID}`}
          element={<div>Organization landing page</div>}
        />
      </Routes>
    </AuthProvider>,
    { route: `/invite/${INVITE_TOKEN}` },
  );

describe("AcceptInvitePage", () => {
  it("shows the invitation's organization, role and email", async () => {
    renderPage();

    expect(await screen.findByText("invitee@example.com")).toBeInTheDocument();
    // The organization name appears in both the description and the detail row.
    expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0);
    expect(screen.getByText("member")).toBeInTheDocument();
  });

  it("asks a new user to create a password", async () => {
    renderPage();

    expect(
      await screen.findByPlaceholderText("Create a password"),
    ).toBeInTheDocument();
  });

  it("asks an existing user for their current password instead", async () => {
    server.use(invitationIs({ ...testInvitation, is_existing_user: true }));

    renderPage();

    expect(
      await screen.findByPlaceholderText("Enter your password"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Create a password"),
    ).not.toBeInTheDocument();
  });

  it("explains an invalid or expired invitation instead of a form", async () => {
    server.use(invitationIs(null));

    renderPage();

    expect(
      await screen.findByText("Invalid or expired invitation"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("rejects a too-short password with the shared-schema message", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Accept Invitation" }));

    expect(
      await screen.findByText("Password must be at least 8 characters"),
    ).toBeInTheDocument();
  });

  it("routes an mfa_required accept into the armed /mfa-verify flow (A2)", async () => {
    server.use(
      invitationIs({ ...testInvitation, is_existing_user: true }),
      http.post(url(`/invitations/${INVITE_TOKEN}/accept`), () =>
        HttpResponse.json({
          status: "success",
          data: {
            mfa_required: true,
            organization_id: ORG_ID,
            role: "member",
          },
          message: "MFA verification required",
        }),
      ),
    );

    const user = userEvent.setup();
    // The real MfaVerifyPage: its card renders only when startMfaChallenge
    // armed the gate — unarmed it bounces to /login instead.
    renderWithProviders(
      <AuthProvider>
        <Routes>
          <Route path="/invite/:token" element={<AcceptInvitePage />} />
          <Route path="/mfa-verify" element={<MfaVerifyPage />} />
          <Route path="/login" element={<div>Login screen</div>} />
        </Routes>
      </AuthProvider>,
      { route: `/invite/${INVITE_TOKEN}` },
    );

    await user.type(await screen.findByLabelText("Password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Accept Invitation" }));

    expect(
      await screen.findByText("Two-factor authentication"),
    ).toBeInTheDocument();
  });

  it("accepts the invitation and lands in the organization", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Accept Invitation" }));

    expect(
      await screen.findByText("Organization landing page"),
    ).toBeInTheDocument();
  });
});
