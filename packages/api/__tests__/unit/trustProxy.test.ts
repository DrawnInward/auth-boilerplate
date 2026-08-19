import express from "express";
import request from "supertest";

import app from "../../src/app";
import { parseTrustProxy } from "../../src/utils/config";

// Behind a reverse proxy every connection reaches Express from the proxy's
// address, so without a trust-proxy setting `req.ip` is the proxy for
// everybody and every IP-keyed limiter becomes ONE bucket for the whole
// site. The login limiter is 10 per 15 minutes, so that is two users away
// from locking each other out.
//
// The setting is security-sensitive in both directions: too tight and
// everyone shares a bucket, too loose and anyone can name their own IP and
// opt out of rate limiting entirely. Hence tests on the parse, the default
// posture, and the resolution behaviour of each accepted shape.

describe("parseTrustProxy", () => {
  it("unset or blank means no proxy", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("   ")).toBe(false);
  });

  it("a digit string becomes a hop count", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
  });

  it("named boundaries and CIDR lists pass through as strings", () => {
    expect(parseTrustProxy("loopback")).toBe("loopback");
    expect(parseTrustProxy("10.0.0.0/8, 172.16.0.0/12")).toBe(
      "10.0.0.0/8, 172.16.0.0/12",
    );
  });

  // validateEnv refuses "true" at boot; the parser deliberately does NOT map
  // it to boolean true, so even a validation bypass cannot produce the
  // trust-anyone setting.
  it('never yields boolean true, even for the string "true"', () => {
    expect(parseTrustProxy("true")).not.toBe(true);
  });
});

// A stand-in for the real app: `app` has no route that reports req.ip, and
// adding one just to observe it would be a production endpoint existing for
// a test. Configured through the same parser, asserted against the real app
// below.
const probe = (trustProxy: string | number | false) => {
  const probeApp = express();
  if (trustProxy !== false) probeApp.set("trust proxy", trustProxy);
  probeApp.get("/whoami", (req, res) => {
    res.json({ ip: req.ip });
  });
  return probeApp;
};

const ipSeenBy = async (
  probeApp: express.Express,
  forwardedFor?: string,
): Promise<string> => {
  const pending = request(probeApp).get("/whoami");
  const res = await (forwardedFor
    ? pending.set("X-Forwarded-For", forwardedFor)
    : pending);
  return res.body.ip;
};

describe("trust proxy", () => {
  // TRUST_PROXY is unset in the test environment, so the app must sit on
  // Express's default: trust nobody, socket address only.
  it("defaults to no proxy when TRUST_PROXY is unset", () => {
    expect(app.get("trust proxy")).toBeFalsy();
  });

  // The regression that matters most: `true` trusts X-Forwarded-For from any
  // peer, which makes every IP-keyed limit opt-out.
  it("is never the permissive setting", () => {
    expect(app.get("trust proxy")).not.toBe(true);
  });

  it('resolves the client IP from X-Forwarded-For under "loopback"', async () => {
    expect(
      await ipSeenBy(probe(parseTrustProxy("loopback")), "203.0.113.7"),
    ).toBe("203.0.113.7");
  });

  it("resolves the client IP from X-Forwarded-For under a hop count", async () => {
    expect(await ipSeenBy(probe(parseTrustProxy("1")), "203.0.113.7")).toBe(
      "203.0.113.7",
    );
  });

  // Express walks the header from the right, skipping trusted addresses. A
  // client can only PREPEND to X-Forwarded-For, so the value the proxy
  // appended is the one that counts and a spoof cannot displace it.
  it("ignores a client-supplied address prepended to the header", async () => {
    expect(
      await ipSeenBy(
        probe(parseTrustProxy("loopback")),
        "1.2.3.4, 203.0.113.7",
      ),
    ).not.toBe("1.2.3.4");
  });

  it("falls back to the socket address when no proxy header is present", async () => {
    expect(await ipSeenBy(probe(parseTrustProxy("loopback")))).toMatch(
      /127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/,
    );
  });

  // What the misconfiguration looks like: everyone arriving as the proxy's
  // own address, which is what collapses the limiters into a single bucket.
  it("without the setting, every caller looks like the proxy", async () => {
    expect(await ipSeenBy(probe(false), "203.0.113.7")).not.toBe("203.0.113.7");
  });
});
