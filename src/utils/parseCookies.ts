export const parseCookies = (
  cookieString: string | undefined
): Record<string, string> => {
  const cookies: Record<string, string> = {};

  if (cookieString) {
    cookieString.split("; ").forEach((cookie) => {
      const [key, value] = cookie.split("=");
      if (key && value) {
        cookies[key] = value;
      }
    });
  }

  return cookies;
};
