import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import useAuth from "@/hooks/use-auth";
import { MY_PERMISSIONS_URL } from "@/hooks/use-super-power-user";
import type { SuperPowerUserEntry } from "@/models/definitions";

export const SUPER_POWER_USERS_URL = "/md/api/v1/super-power-users";

/** Active super power users. The endpoint answers 403 to anyone who is not one. */
export function useSuperPowerUsers() {
  const token = useAuth();
  return useQuery<SuperPowerUserEntry[]>({
    queryKey: [SUPER_POWER_USERS_URL, token],
    enabled: !!token,
  });
}

function useInvalidateAfterChange() {
  const queryClient = useQueryClient();
  // The caller's own permissions may have changed too.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [SUPER_POWER_USERS_URL] }),
      queryClient.invalidateQueries({ queryKey: [MY_PERMISSIONS_URL] }),
    ]);
}

export function useAddSuperPowerUser() {
  const token = useAuth();
  const invalidate = useInvalidateAfterChange();
  return useMutation<SuperPowerUserEntry, Error, { email: string }>({
    mutationFn: async (request) => {
      const response = await apiRequest("POST", SUPER_POWER_USERS_URL, request, token);
      return ((await response.json()) as { data: SuperPowerUserEntry }).data;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveSuperPowerUser() {
  const token = useAuth();
  const invalidate = useInvalidateAfterChange();
  return useMutation<unknown, Error, number>({
    mutationFn: async (id) => {
      // apiRequest only sends the bearer token when a body is given.
      const response = await apiRequest("DELETE", `${SUPER_POWER_USERS_URL}/${id}`, {}, token);
      return response.json();
    },
    onSuccess: invalidate,
  });
}
