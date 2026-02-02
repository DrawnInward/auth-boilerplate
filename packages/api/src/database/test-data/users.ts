import { TEST_UUIDS } from "./testUuids";

const hashedPassword =
  "$2b$10$UOmUkN/DnL0BN0NX2.YXKeaKXCbmWSN0vWN0dD.bcDcbYPJiqI.Pm"; // Hash of Password1

export const testUsers = [
  {
    user_id: TEST_UUIDS.USERS.TEST_USER,
    email: "test@example.com",
    password_hash: hashedPassword,
    email_verified: true,
    is_active: true,
    created_through: "self_registered" as const,
  },
  {
    user_id: TEST_UUIDS.USERS.ALICE,
    email: "alice@example.com",
    password_hash: hashedPassword,
    email_verified: true,
    is_active: true,
    created_through: "self_registered" as const,
  },
  {
    user_id: TEST_UUIDS.USERS.BOB,
    email: "bob@example.com",
    password_hash: hashedPassword,
    email_verified: false,
    is_active: false,
    created_through: "org_invited" as const,
  },
];
