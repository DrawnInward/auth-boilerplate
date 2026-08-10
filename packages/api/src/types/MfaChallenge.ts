export type MfaChallengeRoleType = "user" | "admin";

export interface MfaChallenge {
  jti: string;
  role_id: string;
  role_type: MfaChallengeRoleType;
  expires_at: string;
  consumed_at: string | null;
  failed_attempts: number;
  created_at: string;
}

export interface CreateMfaChallengeDto {
  jti: string;
  role_id: string;
  role_type: MfaChallengeRoleType;
  // Lifetime, not a timestamp: expires_at is written on the DB clock
  // (NOW() + ttl) so expiry decisions never mix app and DB clocks.
  ttl_seconds: number;
}
