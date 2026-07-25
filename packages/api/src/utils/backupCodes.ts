import crypto from "crypto";
import bcrypt from "bcrypt";

const BACKUP_CODE_COUNT = 10;
const SALT_ROUNDS = 10;

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, SALT_ROUNDS)));
}

export async function verifyBackupCode(
  code: string,
  hashedCodes: string[],
): Promise<number> {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(code, hashedCodes[i])) {
      return i;
    }
  }
  return -1;
}
