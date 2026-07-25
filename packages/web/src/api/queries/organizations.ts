import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { orgKeys } from "./orgKeys";
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
    queryKey: orgKeys.all,
    queryFn: () => api.get<OrganizationsResponse>("/organizations"),
  });
}

export function useOrganization(id: string | undefined) {
  return useQuery({
    queryKey: orgKeys.detail(id),
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
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUpdateOrganization(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationDto) =>
      api.put<OrganizationResponse>(`/organizations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(id) });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/organizations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useOrganizationMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: orgKeys.members(orgId),
    queryFn: () => api.get<MembersResponse>(`/organizations/${orgId}/members`),
    enabled: !!orgId,
  });
}

export function useUpdateMemberRole(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: UpdateMemberRoleDto;
    }) =>
      api.put<{ status: string }>(
        `/organizations/${orgId}/members/${userId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.members(orgId),
      });
    },
  });
}

export function useRemoveMember(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      api.delete<{ status: string }>(
        `/organizations/${orgId}/members/${userId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.members(orgId),
      });
    },
  });
}

export function useLeaveOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orgId: string) =>
      api.post<{ status: string }>(`/organizations/${orgId}/leave`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useTransferOwnership(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newOwnerId: string) =>
      api.post<{ status: string }>(
        `/organizations/${orgId}/transfer-ownership`,
        {
          new_owner_id: newOwnerId,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) });
      queryClient.invalidateQueries({
        queryKey: orgKeys.members(orgId),
      });
    },
  });
}

export function useOrganizationInvitations(orgId: string | undefined) {
  return useQuery({
    queryKey: orgKeys.invitations(orgId),
    queryFn: () =>
      api.get<InvitationsResponse>(`/organizations/${orgId}/invitations`),
    enabled: !!orgId,
  });
}

export function useInviteMember(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InviteMemberDto) =>
      api.post<{ status: string }>(`/organizations/${orgId}/invite`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.invitations(orgId),
      });
    },
  });
}

export function useCancelInvitation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) =>
      api.delete<{ status: string }>(
        `/organizations/${orgId}/invitations/${invitationId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.invitations(orgId),
      });
    },
  });
}
