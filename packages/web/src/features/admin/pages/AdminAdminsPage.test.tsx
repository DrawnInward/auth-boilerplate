import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { server } from "@/test/server";
import { adminSignedInAs, testAdmins } from "@/test/handlers";
import { AdminAuthProvider } from "../context/AdminAuthContext";
import { AdminAdminsPage } from "./AdminAdminsPage";

// D3 admin-management slice: what an admin can do here depends on root — the
// server enforces it, and the page must only offer what will succeed.

const renderPage = () =>
  renderWithProviders(
    <AdminAuthProvider>
      <AdminAdminsPage />
    </AdminAuthProvider>,
  );

describe("AdminAdminsPage", () => {
  it("lists admins with their role and status", async () => {
    renderPage();

    expect(await screen.findByText("root@example.com")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("Root")).toBeInTheDocument();
  });

  it("offers invite and disable to the root admin", async () => {
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Invite Admin" }),
    ).toBeInTheDocument();
    // Disable appears only on the active non-root row.
    expect(
      await screen.findByRole("button", { name: "Disable" }),
    ).toBeInTheDocument();
  });

  it("offers neither invite nor disable to a non-root admin", async () => {
    server.use(adminSignedInAs(testAdmins.regular));

    renderPage();

    expect(await screen.findByText("root@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Invite Admin" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
  });
});
