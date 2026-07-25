import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { AuthProvider } from "@/context/AuthContext";
import { renderWithProviders } from "@/test/renderWithProviders";
import { server } from "@/test/server";
import { ORG_ID, signedInAs, testUsers, url } from "@/test/handlers";
import { MembersList } from "./MembersList";

// MembersList reads the signed-in user through useAuth, so it needs the real
// provider — the identity is varied at the HTTP boundary instead.
const renderMembersList = (userRole: string) =>
  renderWithProviders(
    <AuthProvider>
      <MembersList orgId={ORG_ID} userRole={userRole} />
    </AuthProvider>,
  );

const rowFor = async (email: string) => {
  await screen.findByText(email);
  const row = screen
    .getAllByRole("row")
    .find((candidate) => candidate.textContent?.includes(email));
  if (!row) throw new Error(`no table row for ${email}`);
  return row;
};

describe("MembersList", () => {
  it("lists every member once loaded", async () => {
    renderMembersList("owner");

    expect(await screen.findByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("member@example.com")).toBeInTheDocument();
  });

  it("marks the signed-in user's own row", async () => {
    renderMembersList("owner");

    const ownRow = await rowFor("owner@example.com");
    expect(within(ownRow).getByText("You")).toBeInTheDocument();

    const otherRow = await rowFor("member@example.com");
    expect(within(otherRow).queryByText("You")).not.toBeInTheDocument();
  });

  describe("when the viewer can manage members", () => {
    it.each(["owner", "admin"])(
      "shows the Actions column to %s",
      async (role) => {
        renderMembersList(role);

        expect(
          await screen.findByRole("columnheader", { name: "Actions" }),
        ).toBeInTheDocument();
      },
    );

    it("offers role editing and removal for other non-owner members", async () => {
      renderMembersList("owner");

      const memberRow = await rowFor("member@example.com");
      expect(within(memberRow).getByRole("combobox")).toBeInTheDocument();
      expect(
        within(memberRow).getByRole("button", { name: "Remove" }),
      ).toBeInTheDocument();
    });

    it("never offers to edit or remove the owner", async () => {
      // Signed in as the member so the owner row is somebody else's.
      server.use(signedInAs(testUsers.member));
      renderMembersList("admin");

      const ownerRow = await rowFor("owner@example.com");
      expect(within(ownerRow).queryByRole("combobox")).not.toBeInTheDocument();
      expect(
        within(ownerRow).queryByRole("button", { name: "Remove" }),
      ).not.toBeInTheDocument();
      expect(within(ownerRow).getByText("owner")).toBeInTheDocument();
    });

    it("never offers to edit or remove yourself", async () => {
      server.use(signedInAs(testUsers.member));
      renderMembersList("admin");

      const ownRow = await rowFor("member@example.com");
      expect(within(ownRow).queryByRole("combobox")).not.toBeInTheDocument();
      expect(
        within(ownRow).queryByRole("button", { name: "Remove" }),
      ).not.toBeInTheDocument();
    });

    it("asks for confirmation naming the member before removing", async () => {
      renderMembersList("owner");

      const memberRow = await rowFor("member@example.com");
      await userEvent.click(
        within(memberRow).getByRole("button", { name: "Remove" }),
      );

      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toHaveTextContent("member@example.com");
    });
  });

  describe("when the viewer cannot manage members", () => {
    it.each(["member", "viewer"])(
      "hides the Actions column from %s",
      async (role) => {
        renderMembersList(role);

        await screen.findByText("owner@example.com");
        expect(
          screen.queryByRole("columnheader", { name: "Actions" }),
        ).not.toBeInTheDocument();
      },
    );

    it("shows roles as read-only badges", async () => {
      renderMembersList("member");

      const memberRow = await rowFor("member@example.com");
      expect(within(memberRow).queryByRole("combobox")).not.toBeInTheDocument();
      expect(within(memberRow).getByText("member")).toBeInTheDocument();
    });
  });

  it("shows a loading state before the members arrive", async () => {
    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(url(`/organizations/${ORG_ID}/members`), async () => {
        await blocked;
        return HttpResponse.json({ status: "success", data: [] });
      }),
    );

    renderMembersList("owner");

    expect(await screen.findByRole("status")).toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });
});
