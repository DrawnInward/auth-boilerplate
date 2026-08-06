import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { GoogleLinkDto } from "@auth-boilerplate/shared";

// The callback outcomes the API can answer with, discriminated by shape:
// an MFA-enabled account gets a challenge, a Google identity matching an
// unlinked local account needs the password before linking, and everything
// else is a logged-in (or newly created) user.
export type GoogleCallbackData =
  | { mfa_required: true }
  | { needs_linking: true; email: string }
  | { user_id: string; email: string; is_active: boolean };

interface GoogleAuthUrlResponse {
  status: string;
  data: { url: string };
}

interface GoogleCallbackResponse {
  status: string;
  message: string;
  data: GoogleCallbackData;
}

interface GoogleLinkResponse {
  status: string;
  data: { mfa_required: true } | { user_id: string };
}

// Starts the Google flow: fetch the provider auth URL (the API sets its
// oauth_state cookie on this response), then send the whole window there.
export function useGoogleAuth() {
  return useMutation({
    mutationFn: () => api.get<GoogleAuthUrlResponse>("/oauth/google"),
    onSuccess: (response) => {
      window.location.assign(response.data.url);
    },
  });
}

// One-shot exchange of the ?code Google redirected back with. The code and
// the state cookie are both single-use, so this must never refetch.
export function useGoogleCallback(code: string | null, state: string | null) {
  return useQuery({
    queryKey: ["oauth-callback", code],
    queryFn: () => {
      const params = new URLSearchParams();
      if (code) params.set("code", code);
      if (state) params.set("state", state);
      return api.get<GoogleCallbackResponse>(
        `/oauth/google/callback?${params.toString()}`,
      );
    },
    enabled: !!code,
    retry: false,
    staleTime: Infinity,
  });
}

export function useLinkGoogle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GoogleLinkDto) =>
      api.post<GoogleLinkResponse>("/oauth/google/link", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useUnlinkGoogle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ status: string }>("/oauth/google/unlink"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
