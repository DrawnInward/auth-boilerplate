import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { PublicInvitation, AcceptInviteDto } from "@auth-boilerplate/shared";

interface InvitationResponse {
  status: string;
  data: PublicInvitation;
}

export function useInvitation(token: string | undefined) {
  return useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api.get<InvitationResponse>(`/invitations/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AcceptInviteDto) =>
      api.post<{ status: string }>(`/invitations/${token}/accept`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
