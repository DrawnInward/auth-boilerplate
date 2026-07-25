export const parseCookies = (
  cookieString: string | undefined,
): Record<string, string> => {
  const cookies: Record<string, string> = {};

  if (cookieString) {
    cookieString.split("; ").forEach((cookie) => {
      const index = cookie.indexOf("=");
      if (index > -1) {
        const key = cookie.substring(0, index);
        const value = cookie.substring(index + 1);
        if (key && value) {
          // URL-decode the value (Express encodes cookie values)
          cookies[key] = decodeURIComponent(value);
        }
      }
    });
  }

  return cookies;
};
