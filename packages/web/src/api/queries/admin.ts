import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  LoginAdminDto,
  PublicAdmin,
  PublicUser,
  UserStats,
  OrganizationStats,
  OrganizationWithMemberCount,
  MfaVerifyDto,
  MfaBackupVerifyDto,
  MfaRequiredResponse,
} from "@auth-boilerplate/shared";

interface AdminAuthResponse {
  status: string;
  data: PublicAdmin;
  mfa_required?: boolean;
}

type AdminLoginResponse = AdminAuthResponse | MfaRequiredResponse;

export function isAdminMfaRequired(
  response: AdminLoginResponse,
): response is MfaRequiredResponse {
  return "mfa_required" in response && response.mfa_required === true;
}

export function useAdminMe() {
  return useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => api.get<AdminAuthResponse>("/admin/auth/me"),
    retry: false,
  });
}

export function useAdminLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LoginAdminDto) =>
      api.post<AdminLoginResponse>("/admin/auth/login", data),
    onSuccess: (response) => {
      if (!isAdminMfaRequired(response)) {
        queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
      }
    },
  });
}

export function useAdminLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ status: string }>("/admin/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["admin", "me"], null);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useAdminMfaLoginVerify() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MfaVerifyDto) =>
      api.post<AdminAuthResponse>("/admin/auth/mfa/login-verify", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
    },
  });
}

export function useAdminMfaLoginBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MfaBackupVerifyDto) =>
      api.post<AdminAuthResponse>("/admin/auth/mfa/login-backup", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
    },
  });
}

// Admin User Management
interface UsersResponse {
  status: string;
  data: PublicUser[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

interface UserResponse {
  status: string;
  data: PublicUser;
}

interface UserStatsResponse {
  status: string;
  data: UserStats;
}

export function useAdminUsers(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      return api.get<UsersResponse>(`/admin/users${query ? `?${query}` : ""}`);
    },
  });
}

export function useAdminUser(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "users", id],
    queryFn: () => api.get<UserResponse>(`/admin/users/${id}`),
    enabled: !!id,
  });
}

export function useAdminUserStats() {
  return useQuery({
    queryKey: ["admin", "users", "stats"],
    queryFn: () => api.get<UserStatsResponse>("/admin/users/stats"),
  });
}

export function useAdminCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<UserResponse>("/admin/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useAdminUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { email?: string; is_active?: boolean }) =>
      api.put<UserResponse>(`/admin/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useAdminDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useAdminResetUserPassword(id: string) {
  return useMutation({
    mutationFn: (data: { password: string }) =>
      api.put<{ status: string }>(`/admin/users/${id}/reset-password`, data),
  });
}

// Admin Organization Management
interface OrgsResponse {
  status: string;
  data: OrganizationWithMemberCount[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

interface OrgResponse {
  status: string;
  data: OrganizationWithMemberCount;
}

interface OrgStatsResponse {
  status: string;
  data: OrganizationStats;
}

export function useAdminOrganizations(params?: {
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["admin", "organizations", params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      const query = searchParams.toString();
      return api.get<OrgsResponse>(
        `/admin/organizations${query ? `?${query}` : ""}`,
      );
    },
  });
}

export function useAdminOrganization(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "organizations", id],
    queryFn: () => api.get<OrgResponse>(`/admin/organizations/${id}`),
    enabled: !!id,
  });
}

export function useAdminOrganizationStats() {
  return useQuery({
    queryKey: ["admin", "organizations", "stats"],
    queryFn: () => api.get<OrgStatsResponse>("/admin/organizations/stats"),
  });
}

export function useAdminCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; slug?: string; owner_id: string }) =>
      api.post<OrgResponse>("/admin/organizations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
    },
  });
}

export function useAdminUpdateOrganization(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; slug?: string }) =>
      api.put<OrgResponse>(`/admin/organizations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
    },
  });
}

export function useAdminDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/admin/organizations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
    },
  });
}

export type { AdminLoginResponse, MfaRequiredResponse };
