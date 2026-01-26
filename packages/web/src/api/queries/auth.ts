import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  LoginUserDto,
  PublicUser,
  ChangePasswordDto,
  UpdateProfileDto,
  RegisterDto,
  CompleteRegistrationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  MfaVerifyDto,
  MfaBackupVerifyDto,
  MfaRequiredResponse
} from "@auth-boilerplate/shared";

interface AuthResponse {
  status: string;
  data: PublicUser;
  mfa_required?: boolean;
}

type LoginResponse = AuthResponse | MfaRequiredResponse;

function isMfaRequired(response: LoginResponse): response is MfaRequiredResponse {
  return "mfa_required" in response && response.mfa_required === true;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<AuthResponse>("/auth/me"),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LoginUserDto) =>
      api.post<LoginResponse>("/auth/login", data),
    onSuccess: (response) => {
      if (!isMfaRequired(response)) {
        queryClient.invalidateQueries({ queryKey: ["me"] });
      }
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ status: string }>("/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["me"], null);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useMfaLoginVerify() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MfaVerifyDto) =>
      api.post<AuthResponse>("/auth/mfa/login-verify", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useMfaLoginBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MfaBackupVerifyDto) =>
      api.post<AuthResponse>("/auth/mfa/login-backup", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
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
      api.get<{ status: string; data: { email: string } }>(`/auth/verify/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useCompleteRegistration() {
  return useMutation({
    mutationFn: (data: CompleteRegistrationDto) =>
      api.post<{ status: string; message: string }>("/auth/complete-registration", data),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: ForgotPasswordDto) =>
      api.post<{ status: string; message: string }>("/auth/forgot-password", data),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: ResetPasswordDto) =>
      api.post<{ status: string; message: string }>("/auth/reset-password", data),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordDto) =>
      api.put<{ status: string; message: string }>("/auth/change-password", data),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProfileDto) =>
      api.put<AuthResponse>("/auth/profile", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export { isMfaRequired };
export type { LoginResponse, MfaRequiredResponse };
