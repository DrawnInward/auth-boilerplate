import { z } from "zod";

export const mfaVerifySetupSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d+$/, "Code must contain only digits"),
});

export const mfaVerifySchema = z.object({
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d+$/, "Code must contain only digits"),
});

export const mfaDisableSchema = z.object({
  code: z.string().min(1, "Code is required"),
});

export const mfaBackupVerifySchema = z.object({
  code: z.string().min(1, "Backup code is required"),
});

export type MfaVerifySetupDto = z.infer<typeof mfaVerifySetupSchema>;
export type MfaVerifyDto = z.infer<typeof mfaVerifySchema>;
export type MfaDisableDto = z.infer<typeof mfaDisableSchema>;
export type MfaBackupVerifyDto = z.infer<typeof mfaBackupVerifySchema>;
