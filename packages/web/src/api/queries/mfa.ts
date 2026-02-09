import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  MfaVerifySetupDto,
  MfaDisableDto,
  MfaSetupResponse,
  MfaBackupCodesResponse,
} from "@auth-boilerplate/shared";

interface MfaSetupApiResponse {
  status: string;
  data: MfaSetupResponse;
}

interface MfaBackupCodesApiResponse {
  status: string;
  data: MfaBackupCodesResponse;
}

export function useMfaSetup() {
  return useMutation({
    mutationFn: () => api.post<MfaSetupApiResponse>("/auth/mfa/setup"),
  });
}

export function useMfaVerifySetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MfaVerifySetupDto) =>
      api.post<MfaBackupCodesApiResponse>("/auth/mfa/verify-setup", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useMfaDisable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MfaDisableDto) =>
      api.post<{ status: string; message: string }>("/auth/mfa/disable", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useMfaRegenerateBackupCodes() {
  return useMutation({
    mutationFn: (data: MfaVerifySetupDto) =>
      api.post<MfaBackupCodesApiResponse>("/auth/mfa/backup/regenerate", data),
  });
}
