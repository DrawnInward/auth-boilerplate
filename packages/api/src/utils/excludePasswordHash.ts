import { Admin, User } from "../types";

export const excludePasswordHash = (
  user: Admin | User
): Omit<Admin | User, "password_hash"> => {
  const { password_hash, ...userWithoutPassword } = user;
  return userWithoutPassword;
};
