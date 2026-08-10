import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  LoginUserDto,
  MfaRequiredResponse,
  PublicUser,
  ChangePasswordDto,
  RegisterDto,
  CompleteRegistrationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  MfaVerifyDto,
  MfaBackupVerifyDto,
  RequestEmailChangeDto,
} from "@auth-boilerplate/shared";

interface AuthResponse {
  status: string;
  data: PublicUser;
}

// The wire shape is declared once, in shared (mfaRequiredResponseSchema) —
// this alias keeps the established local name.
type MfaRequiredApiResponse = MfaRequiredResponse;

type LoginResponse = AuthResponse | MfaRequiredApiResponse;

// Widened past LoginResponse so any endpoint that can answer mfa_required
// (login, OAuth callback/link, invitation accept) narrows through the same
// guard.
function isMfaRequired(response: {
  data?: unknown;
}): response is MfaRequiredApiResponse {
  return (
    !!response.data &&
    typeof response.data === "object" &&
    "mfa_required" in response.data &&
    response.data.mfa_required === true
  );
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<AuthResponse>("/auth/me"),
    retry: false,
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (data: LoginUserDto) =>
      api.post<LoginResponse>("/auth/login", data),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ status: string }>("/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["me"], null);
    },
  });
}

export function useMfaLoginVerify() {
  return useMutation({
    mutationFn: (data: MfaVerifyDto) =>
      api.post<AuthResponse>("/auth/mfa/login-verify", data),
  });
}

export function useMfaLoginBackup() {
  return useMutation({
    mutationFn: (data: MfaBackupVerifyDto) =>
      api.post<AuthResponse>("/auth/mfa/login-backup", data),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: RegisterDto) =>
      api.post<{ status: string; message: string }>("/auth/register", data),
  });
}

export function useVerifyToken(token: string | undefined) {
  return useQuery({
    queryKey: ["verify-token", token],
    queryFn: () =>
      api.get<{ status: string; data: { email: string } }>(
        `/auth/verify/${token}`,
      ),
    enabled: !!token,
    retry: false,
  });
}

export function useCompleteRegistration() {
  return useMutation({
    mutationFn: (data: CompleteRegistrationDto) =>
      api.post<{ status: string; message: string }>(
        "/auth/complete-registration",
        data,
      ),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: ForgotPasswordDto) =>
      api.post<{ status: string; message: string }>(
        "/auth/forgot-password",
        data,
      ),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: ResetPasswordDto) =>
      api.post<{ status: string; message: string }>(
        "/auth/reset-password",
        data,
      ),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordDto) =>
      api.put<{ status: string; message: string }>(
        "/auth/change-password",
        data,
      ),
  });
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: (data: RequestEmailChangeDto) =>
      api.post<{ status: string; message: string; data: { newEmail: string } }>(
        "/auth/request-email-change",
        data,
      ),
  });
}

export function useConfirmEmailChange(token: string | undefined) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["confirm-email-change", token],
    queryFn: async () => {
      const response = await api.post<{
        status: string;
        message: string;
        data: { email: string };
      }>(`/auth/confirm-email-change/${token}`);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      return response;
    },
    enabled: !!token,
    retry: false,
  });
}

export { isMfaRequired };
export type { LoginResponse, MfaRequiredApiResponse };
