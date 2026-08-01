import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { renderWithProviders } from "@/test/renderWithProviders";
import { server } from "@/test/server";
import { ORG_ID, url } from "@/test/handlers";
import { OrganizationDetailPage } from "./OrganizationDetailPage";

// B6: the async-error path — a failing fetch must surface as the error
// component, never a blank screen or an eternal spinner.

const renderPage = () =>
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
      </Routes>
    </AuthProvider>,
    { route: `/organizations/${ORG_ID}` },
  );

describe("OrganizationDetailPage error handling", () => {
  it("renders the organization when the fetch succeeds", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Acme Corp" }),
    ).toBeInTheDocument();
  });

  it("shows the error state when the API returns a 500", async () => {
    server.use(
      http.get(url(`/organizations/${ORG_ID}`), () =>
        HttpResponse.json(
          { status: "error", message: "Internal server error" },
          { status: 500 },
        ),
      ),
    );

    renderPage();

    expect(
      await screen.findByText("Organization not found"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the error state for an organization the user cannot see", async () => {
    server.use(
      http.get(url(`/organizations/${ORG_ID}`), () =>
        HttpResponse.json(
          { status: "error", message: "Forbidden" },
          { status: 403 },
        ),
      ),
    );

    renderPage();

    expect(
      await screen.findByText("Organization not found"),
    ).toBeInTheDocument();
  });
});
