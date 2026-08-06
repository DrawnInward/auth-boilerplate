import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { server } from "@/test/server";
import { signedInAs, testUsers } from "@/test/handlers";
import { AuthProvider } from "@/context/AuthContext";
import { OAuthTab } from "./OAuthTab";

// D3: the connected-accounts gating — which action a user is offered depends
// entirely on auth_provider, and offering the wrong one used to navigate the
// whole window to a JSON endpoint.

const renderTab = (authProvider: "local" | "google" | "both") => {
  server.use(signedInAs({ ...testUsers.owner, auth_provider: authProvider }));
  return renderWithProviders(
    <AuthProvider>
      <OAuthTab />
    </AuthProvider>,
  );
};

describe("OAuthTab", () => {
  it("offers Link to a local-only account", async () => {
    renderTab("local");

    expect(
      await screen.findByRole("button", { name: "Link" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unlink" }),
    ).not.toBeInTheDocument();
  });

  it("offers Unlink to an account with both providers", async () => {
    renderTab("both");

    expect(
      await screen.findByRole("button", { name: "Unlink" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Link" }),
    ).not.toBeInTheDocument();
  });

  it("tells a Google-only account to set a password before unlinking", async () => {
    renderTab("google");

    expect(
      await screen.findByText("Set a password first to unlink"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unlink" }),
    ).not.toBeInTheDocument();
  });
});
