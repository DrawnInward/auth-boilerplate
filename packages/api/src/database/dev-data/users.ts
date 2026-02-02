import { DEV_UUIDS } from "./devUuids";

const PASSWORD_HASH =
  "$2b$10$UOmUkN/DnL0BN0NX2.YXKeaKXCbmWSN0vWN0dD.bcDcbYPJiqI.Pm"; // Hash of Password1

export const devUsers = [
  {
    user_id: DEV_UUIDS.USERS.DEMO_USER,
    email: "demo@example.com",
    password_hash: PASSWORD_HASH,
    email_verified: true,
    is_active: true,
    created_through: "self_registered" as const,
  },
];
