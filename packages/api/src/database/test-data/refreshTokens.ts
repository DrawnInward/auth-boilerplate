import { TEST_UUIDS, getRoleUuid } from "./testUuids";

export const testRefreshTokens = [
  // Active, valid token
  {
    refresh_id: TEST_UUIDS.REFRESH_TOKENS[0],
    role_id: getRoleUuid(1, "user"), // TEST_USER
    role_type: "user",
    token_hash: "hash_active_valid_token",
    expiration_time: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(), // 7 days future
    issued_time: new Date().toISOString(),
    last_used_time: null,
    is_active: true,
    used_at: null,
  },
  // Already used token (for testing replay attack protection)
  {
    refresh_id: TEST_UUIDS.REFRESH_TOKENS[1],
    role_id: getRoleUuid(1, "user"), // TEST_USER
    role_type: "user",
    token_hash: "hash_already_used_token",
    expiration_time: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    issued_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    last_used_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    is_active: false,
    used_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  // Expired token
  {
    refresh_id: TEST_UUIDS.REFRESH_TOKENS[2],
    role_id: getRoleUuid(2, "user"), // ALICE
    role_type: "user",
    token_hash: "hash_expired_token",
    expiration_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    issued_time: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(), // 31 days ago
    last_used_time: null,
    is_active: true,
    used_at: null,
  },
  // Revoked token (manually revoked)
  {
    refresh_id: TEST_UUIDS.REFRESH_TOKENS[3],
    role_id: getRoleUuid(2, "user"), // ALICE
    role_type: "user",
    token_hash: "hash_revoked_token",
    expiration_time: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    issued_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    last_used_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    is_active: false,
    used_at: null,
  },
  // Admin token
  {
    refresh_id: TEST_UUIDS.REFRESH_TOKENS[4],
    role_id: getRoleUuid(1, "admin"), // ROOT_ADMIN
    role_type: "admin",
    token_hash: "hash_admin_token",
    expiration_time: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString(), // 30 days
    issued_time: new Date().toISOString(),
    last_used_time: null,
    is_active: true,
    used_at: null,
  },
  // Multiple tokens for same user (user 3)
  {
    refresh_id: TEST_UUIDS.REFRESH_TOKENS[5],
    role_id: getRoleUuid(3, "user"), // BOB
    role_type: "user",
    token_hash: "hash_user3_token_1",
    expiration_time: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    issued_time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    last_used_time: null,
    is_active: true,
    used_at: null,
  },
  {
    refresh_id: TEST_UUIDS.REFRESH_TOKENS[6],
    role_id: getRoleUuid(3, "user"), // BOB
    role_type: "user",
    token_hash: "hash_user3_token_2",
    expiration_time: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    issued_time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    last_used_time: null,
    is_active: true,
    used_at: null,
  },
  // Token about to expire (for testing edge cases)
  {
    refresh_id: TEST_UUIDS.REFRESH_TOKENS[7],
    role_id: getRoleUuid(1, "user"), // TEST_USER
    role_type: "user",
    token_hash: "hash_almost_expired_token",
    expiration_time: new Date(Date.now() + 60 * 1000).toISOString(), // expires in 1 minute
    issued_time: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString(), // 89 days ago
    last_used_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    is_active: true,
    used_at: null,
  },
];
