import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { MfaVerifyForm } from "./MfaVerifyForm";

// B6: the MFA verification flow as the user drives it — TOTP entry, the
// switch to a backup code, and the shared-schema validation messages that
// keep a malformed code from ever reaching the API.

const renderForm = () => {
  const onSubmitCode = vi.fn().mockResolvedValue(undefined);
  const onSubmitBackup = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <MfaVerifyForm
      onSubmitCode={onSubmitCode}
      onSubmitBackup={onSubmitBackup}
    />,
  );
  return { onSubmitCode, onSubmitBackup };
};

describe("MfaVerifyForm", () => {
  it("submits a 6-digit authenticator code", async () => {
    const user = userEvent.setup();
    const { onSubmitCode, onSubmitBackup } = renderForm();

    await user.type(screen.getByLabelText("Verification Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(onSubmitCode).toHaveBeenCalledWith(
      { code: "123456" },
      expect.anything(),
    );
    expect(onSubmitBackup).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric code with the shared-schema message", async () => {
    const user = userEvent.setup();
    const { onSubmitCode } = renderForm();

    await user.type(screen.getByLabelText("Verification Code"), "12345a");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(
      await screen.findByText("Code must contain only digits"),
    ).toBeInTheDocument();
    expect(onSubmitCode).not.toHaveBeenCalled();
  });

  it("rejects a short code with the shared-schema message", async () => {
    const user = userEvent.setup();
    const { onSubmitCode } = renderForm();

    await user.type(screen.getByLabelText("Verification Code"), "123");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(
      await screen.findByText("Code must be 6 digits"),
    ).toBeInTheDocument();
    expect(onSubmitCode).not.toHaveBeenCalled();
  });

  it("switches to backup-code entry and submits a backup code", async () => {
    const user = userEvent.setup();
    const { onSubmitCode, onSubmitBackup } = renderForm();

    await user.click(
      screen.getByRole("button", { name: "Use backup code instead" }),
    );

    await user.type(screen.getByLabelText("Backup Code"), "ABCD-1234");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(onSubmitBackup).toHaveBeenCalledWith(
      { code: "ABCD-1234" },
      expect.anything(),
    );
    expect(onSubmitCode).not.toHaveBeenCalled();
  });

  it("requires a backup code before submitting", async () => {
    const user = userEvent.setup();
    const { onSubmitBackup } = renderForm();

    await user.click(
      screen.getByRole("button", { name: "Use backup code instead" }),
    );
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(
      await screen.findByText("Backup code is required"),
    ).toBeInTheDocument();
    expect(onSubmitBackup).not.toHaveBeenCalled();
  });

  it("can switch back to authenticator-code entry", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(
      screen.getByRole("button", { name: "Use backup code instead" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Use authenticator code instead" }),
    );

    expect(screen.getByLabelText("Verification Code")).toBeInTheDocument();
  });
});
