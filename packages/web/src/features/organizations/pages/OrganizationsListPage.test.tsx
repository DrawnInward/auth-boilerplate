import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { AuthProvider } from "@/context/AuthContext";
import { renderWithProviders } from "@/test/renderWithProviders";
import { server } from "@/test/server";
import { signedInAs, testUsers, url } from "@/test/handlers";
import { OrganizationsListPage } from "./OrganizationsListPage";

const renderPage = () =>
  renderWithProviders(
    <AuthProvider>
      <OrganizationsListPage />
    </AuthProvider>,
  );

const CREATE_BUTTON = { name: /create organization/i };

describe("OrganizationsListPage", () => {
  it("lists the organizations returned by the API", async () => {
    renderPage();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
  });

  it("shows a spinner until the organizations arrive", async () => {
    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(url("/organizations"), async () => {
        await blocked;
        return HttpResponse.json({ status: "success", data: [] });
      }),
    );

    renderPage();

    expect(await screen.findByRole("status")).toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });

  it("explains the empty case rather than showing a bare list", async () => {
    server.use(
      http.get(url("/organizations"), () =>
        HttpResponse.json({ status: "success", data: [] }),
      ),
    );

    renderPage();

    expect(
      await screen.findByText(/not a member of any organizations yet/i),
    ).toBeInTheDocument();
  });

  describe("create-organization gating", () => {
    it("hides the create action from users who may not create orgs", async () => {
      server.use(signedInAs({ ...testUsers.owner, can_create_orgs: false }));

      renderPage();

      await screen.findByText("Acme Corp");
      expect(
        screen.queryByRole("button", CREATE_BUTTON),
      ).not.toBeInTheDocument();
    });

    it("offers the create action to users who may", async () => {
      server.use(signedInAs({ ...testUsers.owner, can_create_orgs: true }));

      renderPage();

      expect(
        await screen.findByRole("button", CREATE_BUTTON),
      ).toBeInTheDocument();
    });

    it("offers a first-organization prompt when permitted and empty", async () => {
      server.use(
        signedInAs({ ...testUsers.owner, can_create_orgs: true }),
        http.get(url("/organizations"), () =>
          HttpResponse.json({ status: "success", data: [] }),
        ),
      );

      renderPage();

      expect(
        await screen.findByRole("button", { name: /create your first/i }),
      ).toBeInTheDocument();
    });
  });
});
