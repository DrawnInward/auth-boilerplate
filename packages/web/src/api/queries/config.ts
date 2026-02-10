import { useQuery } from "@tanstack/react-query";
import { api } from "../client";

export interface AppConfig {
  oauth: {
    google: boolean;
  };
  registration: {
    accountCreationMode: "open" | "invite_only" | "admin_only";
    orgCreationMode: "open" | "self_registered_only" | "admin_only";
  };
}

interface ConfigResponse {
  status: string;
  data: AppConfig;
}

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<ConfigResponse>("/config"),
    staleTime: Infinity,
    retry: false,
  });
}
