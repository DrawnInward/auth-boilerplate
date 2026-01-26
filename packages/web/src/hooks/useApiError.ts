import { useCallback } from "react";
import { toast } from "sonner";
import type { ApiError } from "@/api/client";

export function useApiError() {
  const handleError = useCallback((error: unknown) => {
    const apiError = error as ApiError;
    const message = apiError?.message || "An unexpected error occurred";
    toast.error(message);
    return message;
  }, []);

  return { handleError };
}
