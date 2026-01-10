"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

import { apiRequest, ApiError, clearStoredToken } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

type AuthUser = {
  email?: string;
  name?: string;
  role?: string;
  [key: string]: unknown;
};

export function useAuth() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const isLoginRoute = pathname === "/login";
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () =>
      apiRequest<AuthUser>(endpoints.auth.me, {
        skipRefresh: isLoginRoute,
      }),
    enabled: !isLoginRoute,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) {
        return false;
      }
      return failureCount < 1;
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      await apiRequest(endpoints.auth.logout, { method: "POST" });
      clearStoredToken();
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null);
    },
  });

  return {
    ...query,
    user: query.data ?? null,
    isAuthenticated: Boolean(query.data),
    logout,
  };
}
