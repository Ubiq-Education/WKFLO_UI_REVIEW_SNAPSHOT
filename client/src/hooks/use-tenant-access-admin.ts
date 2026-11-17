import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import useAuth from "@/hooks/use-auth";
import { MY_PERMISSIONS_URL } from "@/hooks/use-super-power-user";
import type { AddTenantAccessRequest, TenantAccessEntry, TenantSummary } from "@/models/definitions";

export const TENANT_ACCESS_URL = "/md/api/v1/tenant-access";
export const TENANTS_URL = "/md/api/v1/tenants";

/** Active tenant access rows (tenant + email), ordered by tenant name then email. */
export function useTenantAccess() {
  const token = useAuth();
  return useQuery<TenantAccessEntry[]>({
    queryKey: [TENANT_ACCESS_URL, token],
    enabled: !!token,
  });
}

/** All tenants, for the add-access combobox and the list filter. */
export function useAllTenants() {
  const token = useAuth();
  return useQuery<TenantSummary[]>({
    queryKey: [TENANTS_URL, token],
    enabled: !!token,
  });
}

function useInvalidateAfterChange() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [TENANT_ACCESS_URL] }),
      queryClient.invalidateQueries({ queryKey: [MY_PERMISSIONS_URL] }),
    ]);
}

export function useAddTenantAccess() {
  const token = useAuth();
  const invalidate = useInvalidateAfterChange();
  return useMutation<TenantAccessEntry, Error, AddTenantAccessRequest>({
    mutationFn: async (request) => {
      const response = await apiRequest("POST", TENANT_ACCESS_URL, request, token);
      return ((await response.json()) as { data: TenantAccessEntry }).data;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveTenantAccess() {
  const token = useAuth();
  const invalidate = useInvalidateAfterChange();
  return useMutation<unknown, Error, number>({
    mutationFn: async (id) => {
      const response = await apiRequest("DELETE", `${TENANT_ACCESS_URL}/${id}`, {}, token);
      return response.json();
    },
    onSuccess: invalidate,
  });
}
