import { createEmailService, EmailService } from "../../src/services";
import { MemoryEmailProvider } from "../../src/utils/email/providers";

const APP_NAME = "Test App";
const FRONTEND_URL = "https://app.example.test";

describe("emailService", () => {
  let provider: MemoryEmailProvider;
  let email: EmailService;

  beforeEach(() => {
    provider = new MemoryEmailProvider();
    email = createEmailService({
      provider,
      appName: APP_NAME,
      frontendUrl: FRONTEND_URL,
    });
  });

  it("sends exactly one email per call, through the injected provider", async () => {
    await email.sendVerification("user@example.com", "tok");

    expect(provider.sent).toHaveLength(1);
    expect(provider.last?.to).toBe("user@example.com");
  });

  // Every message carries the configured branding in its subject, and every one
  // that links somewhere builds that link from the configured frontend URL —
  // the two things a misconfigured deployment gets wrong.
  describe("branding and links", () => {
    it.each([
      [
        "verification",
        () => email.sendVerification("user@example.com", "tok"),
        `${FRONTEND_URL}/verify-email/tok`,
      ],
      [
        "password reset",
        () => email.sendPasswordReset("user@example.com", "tok"),
        `${FRONTEND_URL}/reset-password/tok`,
      ],
      [
        "admin invite",
        () => email.sendAdminInvite("user@example.com", "tok"),
        `${FRONTEND_URL}/complete-registration?token=tok`,
      ],
      [
        "email change verification",
        () => email.sendEmailChangeVerification("new@example.com", "tok"),
        `${FRONTEND_URL}/confirm-email-change/tok`,
      ],
      [
        "org invite",
        () =>
          email.sendOrgInvite({
            to: "user@example.com",
            token: "tok",
            organizationName: "Acme",
            role: "member",
          }),
        `${FRONTEND_URL}/invitations/tok`,
      ],
    ])("%s links to the configured frontend", async (_name, send, link) => {
      await send();

      expect(provider.last?.text).toContain(link);
      expect(provider.last?.html).toContain(link);
    });

    it.each([
      ["verification", () => email.sendVerification("u@example.com", "t")],
      ["password reset", () => email.sendPasswordReset("u@example.com", "t")],
      ["admin invite", () => email.sendAdminInvite("u@example.com", "t")],
      ["mfa enabled", () => email.sendMfaEnabled("u@example.com")],
      ["mfa disabled", () => email.sendMfaDisabled("u@example.com")],
      [
        "email change notification",
        () => email.sendEmailChangeNotification("old@example.com", "n@x.test"),
      ],
    ])("%s names the app in its subject", async (_name, send) => {
      await send();

      expect(provider.last?.subject).toContain(APP_NAME);
    });
  });

  describe("recipients", () => {
    it("sends the change verification to the new address", async () => {
      await email.sendEmailChangeVerification("new@example.com", "tok");

      expect(provider.last?.to).toBe("new@example.com");
    });

    it("sends the change notification to the current address", async () => {
      await email.sendEmailChangeNotification(
        "current@example.com",
        "new@example.com",
      );

      expect(provider.last?.to).toBe("current@example.com");
      // The warning is only useful if it says what the address would change to.
      expect(provider.last?.text).toContain("new@example.com");
    });
  });

  describe("org invites", () => {
    it("names the inviter when one is known", async () => {
      await email.sendOrgInvite({
        to: "user@example.com",
        token: "tok",
        organizationName: "Acme",
        role: "admin",
        inviterEmail: "boss@example.com",
      });

      expect(provider.last?.text).toContain(
        "boss@example.com has invited you to join",
      );
    });

    it("falls back to an impersonal phrasing without an inviter", async () => {
      await email.sendOrgInvite({
        to: "user@example.com",
        token: "tok",
        organizationName: "Acme",
        role: "admin",
      });

      expect(provider.last?.text).toContain("You have been invited to join");
    });

    it("names the organization and role", async () => {
      await email.sendOrgInvite({
        to: "user@example.com",
        token: "tok",
        organizationName: "Acme",
        role: "viewer",
      });

      expect(provider.last?.subject).toContain("Acme");
      expect(provider.last?.text).toContain("as a viewer");
    });
  });

  it("escapes HTML in interpolated values so copy cannot inject markup", async () => {
    await email.sendOrgInvite({
      to: "user@example.com",
      token: "tok",
      organizationName: '<script>alert("x")</script>',
      role: "member",
    });

    expect(provider.last?.html).not.toContain("<script>");
    expect(provider.last?.html).toContain("&lt;script&gt;");
  });
});
