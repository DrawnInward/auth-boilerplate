import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  OrganizationWithRole,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
  Invitation,
} from "@auth-boilerplate/shared";

interface OrganizationsResponse {
  status: string;
  data: OrganizationWithRole[];
}

interface OrganizationResponse {
  status: string;
  data: OrganizationWithRole;
}

export interface OrganizationMemberWithEmail {
  id: string;
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at?: string;
}

interface MembersResponse {
  status: string;
  data: OrganizationMemberWithEmail[];
}

interface InvitationsResponse {
  status: string;
  data: Invitation[];
}

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<OrganizationsResponse>("/organizations"),
  });
}

export function useOrganization(id: string | undefined) {
  return useQuery({
    queryKey: ["organizations", id],
    queryFn: () => api.get<OrganizationResponse>(`/organizations/${id}`),
    enabled: !!id,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOrganizationDto) =>
      api.post<OrganizationResponse>("/organizations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useUpdateOrganization(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationDto) =>
      api.put<OrganizationResponse>(`/organizations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", id] });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/organizations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useOrganizationMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ["organizations", orgId, "members"],
    queryFn: () => api.get<MembersResponse>(`/organizations/${orgId}/members`),
    enabled: !!orgId,
  });
}

export function useUpdateMemberRole(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateMemberRoleDto }) =>
      api.put<{ status: string }>(`/organizations/${orgId}/members/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "members"] });
    },
  });
}

export function useRemoveMember(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      api.delete<{ status: string }>(`/organizations/${orgId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "members"] });
    },
  });
}

export function useLeaveOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orgId: string) =>
      api.post<{ status: string }>(`/organizations/${orgId}/leave`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useTransferOwnership(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newOwnerId: string) =>
      api.post<{ status: string }>(`/organizations/${orgId}/transfer-ownership`, {
        new_owner_id: newOwnerId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "members"] });
    },
  });
}

export function useOrganizationInvitations(orgId: string | undefined) {
  return useQuery({
    queryKey: ["organizations", orgId, "invitations"],
    queryFn: () => api.get<InvitationsResponse>(`/organizations/${orgId}/invitations`),
    enabled: !!orgId,
  });
}

export function useInviteMember(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InviteMemberDto) =>
      api.post<{ status: string }>(`/organizations/${orgId}/invite`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "invitations"] });
    },
  });
}

export function useCancelInvitation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) =>
      api.delete<{ status: string }>(`/organizations/${orgId}/invitations/${invitationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "invitations"] });
    },
  });
}
