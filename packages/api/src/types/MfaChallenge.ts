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
  expires_at: Date;
}
