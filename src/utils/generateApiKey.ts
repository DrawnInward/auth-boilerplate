import { randomBytes } from "crypto";

export function generateApiKey() {
  const apiKey = randomBytes(32).toString("hex");
  return apiKey;
}

generateApiKey();
