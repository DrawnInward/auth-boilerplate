import { DEV_UUIDS } from "./devUuids";

const hashedPassword =
  "$2b$10$UOmUkN/DnL0BN0NX2.YXKeaKXCbmWSN0vWN0dD.bcDcbYPJiqI.Pm"; // Hash of Password1

export const devAdmins = [
  {
    admin_id: DEV_UUIDS.ADMINS.ROOT_ADMIN,
    email: "root.admin@test.com",
    password_hash: hashedPassword,
    root: true,
    email_verified: true,
    is_active: true,
    deactivated_at: null,
  },
];
