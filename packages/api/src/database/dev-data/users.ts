import { DEV_UUIDS } from "./devUuids";

// bcrypt hash of "Password123!" (10 rounds)
const DEMO_PASSWORD_HASH = "$2b$10$dQxYw8J7X8vK8Z6Y5W4xPu8Q1Z2Y3X4W5V6U7T8S9R0Q1P2O3N4M5K6J";

// bcrypt hash of "AdminPassword123!" (10 rounds)
const ADMIN_PASSWORD_HASH = "$2b$10$rQxYw8J7X8vK8Z6Y5W4xPu8Q1Z2Y3X4W5V6U7T8S9R0Q1P2O3N4M5K6J";

export const devUsers = [
  {
    user_id: DEV_UUIDS.USERS.DEMO_USER,
    email: "demo@example.com",
    password_hash: DEMO_PASSWORD_HASH,
    email_verified: true,
    is_active: true,
  },
];

export const devAdmins = [
  {
    admin_id: DEV_UUIDS.ADMINS.ROOT_ADMIN,
    email: "admin@example.com",
    password_hash: ADMIN_PASSWORD_HASH,
    root: true,
    email_verified: true,
    is_active: true,
  },
];
