import { TOTP, Secret } from "otpauth";
import * as QRCode from "qrcode";
import { getAppName } from "./config";

export interface TotpSetupResult {
  secret: string;
  uri: string;
  qrCodeDataUrl: string;
}

export async function generateTotpSecret(
  email: string,
): Promise<TotpSetupResult> {
  const secret = new Secret({ size: 20 });
  const appName = getAppName();

  const totp = new TOTP({
    issuer: appName,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  return {
    secret: secret.base32,
    uri,
    qrCodeDataUrl,
  };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}
