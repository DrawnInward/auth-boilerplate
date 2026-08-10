import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { orgKeys } from "./orgKeys";
import type {
  PublicInvitation,
  AcceptInviteDto,
  AcceptInviteResponseData,
} from "@auth-boilerplate/shared";
import { isMfaRequired, type MfaRequiredApiResponse } from "./auth";

interface InvitationResponse {
  status: string;
  data: PublicInvitation;
}

// Accepting as an MFA-enabled existing user commits the org-join but answers
// mfa_required instead of a session (hardening A2) — the page routes that
// branch into the /mfa-verify flow.
type AcceptInviteResponse =
  { status: string; data: AcceptInviteResponseData } | MfaRequiredApiResponse;

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
      api.post<AcceptInviteResponse>(`/invitations/${token}/accept`, data),
    onSuccess: (response) => {
      // No session yet on the mfa_required branch — a refetch of /auth/me
      // would just be a guaranteed 401; the post-MFA login refetches instead.
      if (isMfaRequired(response)) return;
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
