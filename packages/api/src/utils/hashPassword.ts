import bcrypt from "bcrypt";
import { childLogger } from "./logger";
import { getBcryptCost } from "./config";

const log = childLogger("hashPassword");

export const hashPassword = async (password: string): Promise<string> => {
  try {
    const hashedPassword = await bcrypt.hash(password, getBcryptCost());
    return hashedPassword;
  } catch (error) {
    log.error({ err: error }, "Error hashing password");
    throw new Error("Failed to hash password");
  }
};
