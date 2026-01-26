import { TEST_UUIDS } from "./testUuids";

const passwordHash =
  "$2b$10$UOmUkN/DnL0BN0NX2.YXKeaKXCbmWSN0vWN0dD.bcDcbYPJiqI.Pm"; // Hash of Password1

export const testAdmins = [
  // Active root admin (only one)
  {
    admin_id: TEST_UUIDS.ADMINS.ROOT_ADMIN,
    email: "root.admin@test.com",
    password_hash: passwordHash,
    root: true,
    email_verified: true,
    is_active: true,
    deactivated_at: null,
  },
  // Active regular admin
  {
    admin_id: TEST_UUIDS.ADMINS.REGULAR_ADMIN,
    email: "regular.admin@test.com",
    password_hash: passwordHash,
    root: false,
    email_verified: true,
    is_active: true,
    deactivated_at: null,
  },
  // Deactivated admin
  {
    admin_id: TEST_UUIDS.ADMINS.DEACTIVATED_ADMIN,
    email: "deactivated.admin@test.com",
    password_hash: passwordHash,
    root: false,
    email_verified: true,
    is_active: false,
    deactivated_at: new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString(), // 30 days ago
  },
  // Unverified email admin
  {
    admin_id: TEST_UUIDS.ADMINS.UNVERIFIED_ADMIN,
    email: "unverified.admin@test.com",
    password_hash: passwordHash,
    root: false,
    email_verified: false,
    is_active: true,
    deactivated_at: null,
  },
  // Recently deactivated admin
  {
    admin_id: TEST_UUIDS.ADMINS.RECENT_DEACTIVATED,
    email: "recently.deactivated@test.com",
    password_hash: passwordHash,
    root: false,
    email_verified: true,
    is_active: false,
    deactivated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
  },
];
