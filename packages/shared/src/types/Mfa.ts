import { z } from "zod";

export const mfaVerifySetupSchema = z.object({
  code: z
    .string()
    .length(6, "Code must be 6 digits")
    .regex(/^\d+$/, "Code must contain only digits"),
});

export type MfaVerifySetupDto = z.infer<typeof mfaVerifySetupSchema>;

export const mfaVerifySchema = z.object({
  code: z
    .string()
    .length(6, "Code must be 6 digits")
    .regex(/^\d+$/, "Code must contain only digits"),
});

export type MfaVerifyDto = z.infer<typeof mfaVerifySchema>;

export const mfaDisableSchema = z.object({
  code: z.string().min(1, "Code is required"),
});

export type MfaDisableDto = z.infer<typeof mfaDisableSchema>;

export const mfaBackupVerifySchema = z.object({
  code: z.string().min(1, "Backup code is required"),
});

export type MfaBackupVerifyDto = z.infer<typeof mfaBackupVerifySchema>;

export const mfaSetupResponseSchema = z.object({
  secret: z.string(),
  qr_code: z.string(),
});

export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

export const mfaBackupCodesResponseSchema = z.object({
  backup_codes: z.array(z.string()),
});

export type MfaBackupCodesResponse = z.infer<
  typeof mfaBackupCodesResponseSchema
>;

export const mfaRequiredResponseSchema = z.object({
  status: z.string(),
  mfa_required: z.boolean(),
  message: z.string(),
});

export type MfaRequiredResponse = z.infer<typeof mfaRequiredResponseSchema>;
