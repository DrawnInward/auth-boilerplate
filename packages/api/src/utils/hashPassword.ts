import bcrypt from "bcrypt";
import { childLogger } from "./logger";

const log = childLogger("hashPassword");

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 10;
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error) {
    log.error({ err: error }, "Error hashing password");
    throw new Error("Failed to hash password");
  }
};
