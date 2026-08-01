import { sanitizeUrl } from "../../src/utils/sanitizeUrl";

// B5: the URL sanitiser that keeps javascript:/data: payloads out of emails
// and rendered links.

describe("sanitizeUrl", () => {
  const passesThrough: string[] = [
    "https://example.com",
    "https://example.com/path?query=1#frag",
    "http://localhost:5173/reset",
    "/relative/path",
    "relative/path",
    "?query=only",
    "#fragment",
  ];

  it.each(passesThrough)("allows %s", (url) => {
    expect(sanitizeUrl(url)).toBe(url);
  });

  const neutralised: string[] = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "  javascript:alert(1)",
    "vbscript:msgbox(1)",
    "ftp://example.com/file",
    "file:///etc/passwd",
  ];

  it.each(neutralised)("neutralises %s to #", (url) => {
    expect(sanitizeUrl(url)).toBe("#");
  });

  it("neutralises data: URLs whether or not they parse as absolute", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
  });
});
