import { parseCookies } from "../../src/utils/parseCookies";

// B5: the cookie-header parser every authenticated request flows through.

describe("parseCookies", () => {
  it("returns an empty object for an undefined header", () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it("returns an empty object for an empty string", () => {
    expect(parseCookies("")).toEqual({});
  });

  it("parses a single cookie", () => {
    expect(parseCookies("access_token=abc123")).toEqual({
      access_token: "abc123",
    });
  });

  it("parses multiple cookies", () => {
    expect(parseCookies("access_token=abc; refresh_token=def")).toEqual({
      access_token: "abc",
      refresh_token: "def",
    });
  });

  it("keeps '=' characters inside a value (JWTs, base64)", () => {
    expect(parseCookies("token=header.payload.sig==")).toEqual({
      token: "header.payload.sig==",
    });
  });

  it("URL-decodes values", () => {
    expect(parseCookies("name=hello%20world%3D")).toEqual({
      name: "hello world=",
    });
  });

  it("drops cookies with an empty value or no '='", () => {
    expect(parseCookies("empty=; bare; ok=1")).toEqual({ ok: "1" });
  });
});
