export const sanitizeUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return "#";
    }
    return url;
  } catch {
    // If URL parsing fails, it might be a relative URL
    // Check for dangerous patterns
    const trimmed = url.trim().toLowerCase();
    if (
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("data:") ||
      trimmed.startsWith("vbscript:")
    ) {
      return "#";
    }
    // Allow relative URLs
    return url;
  }
};
