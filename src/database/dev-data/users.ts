import { DEV_UUIDS } from "./devUuids";

export const devUsers = [
  {
    user_id: DEV_UUIDS.USERS.DEMO_USER,
    email: "demo@example.com",
    password_hash: "$2b$10$YourHashedPasswordHere", // bcrypt hash of "password123"
    email_verified: true,
    is_active: true,
  },
];

export const devAdmins = [
  {
    admin_id: DEV_UUIDS.ADMINS.ROOT_ADMIN,
    email: "admin@example.com",
    password_hash: "$2b$10$YourHashedPasswordHere", // bcrypt hash of "admin123"
    root: true,
    email_verified: true,
    is_active: true,
  },
];
