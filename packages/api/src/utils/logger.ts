import pino from "pino";

// The single logger. Modules take a child (`logger.child({ module: "..." })`)
// so every line carries its origin; request-scoped lines go through `req.log`
// (pino-http, wired in app.ts) so they carry the request id.
//
// Never log secrets, tokens, cookies, password hashes, or personal data beyond
// what an operator needs to trace a request — the redact list below is a
// backstop for accidents, not a licence to pass sensitive objects in.

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === "test"
    ? "silent"
    : process.env.NODE_ENV === "production"
      ? "info"
      : "debug");

export const logger = pino({
  level,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.password_hash",
      "*.token",
      "*.token_hash",
      "*.mfa_secret",
    ],
    censor: "[redacted]",
  },
  // Pretty output is a dev-only concern and deliberately not a dependency here:
  // pipe through `pino-pretty` locally if you want it.
});

export const childLogger = (module: string) => logger.child({ module });
