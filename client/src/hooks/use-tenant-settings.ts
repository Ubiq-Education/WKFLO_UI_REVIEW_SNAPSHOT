import { useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";
import type { TenantSettings, UpdateTenantSettingsRequest } from "@/models/definitions";

export const TENANT_SETTINGS_URL = "/md/api/v1/tenant/settings";

/** Tenant-wide settings for the selected tenant (defaults filled in server-side). */
export function useTenantSettings() {
  const token = useAuth();
  const { selectedTenantGuid } = useContext(DataContext);

  return useQuery<TenantSettings>({
    // The tenant guid is part of the key so switching tenants never shows the previous tenant's settings.
    queryKey: [TENANT_SETTINGS_URL, token, selectedTenantGuid],
    enabled: !!token && !!selectedTenantGuid,
  });
}

export function useUpdateTenantSettings() {
  const token = useAuth();
  const { selectedTenantGuid } = useContext(DataContext);
  const queryClient = useQueryClient();

  return useMutation<TenantSettings, Error, UpdateTenantSettingsRequest, { queryKey: readonly unknown[] }>({
    mutationFn: async (request) => {
      const response = await apiRequest("PUT", TENANT_SETTINGS_URL, request, token);
      const body = (await response.json()) as { data?: TenantSettings };
      if (!body?.data) throw new Error("The server returned no settings.");
      return body.data;
    },
    // Capture the key of the tenant that started the save: the hook's options follow the latest render,
    // so reading selectedTenantGuid in onSuccess would use whichever tenant is selected when the PUT returns.
    onMutate: () => ({ queryKey: [TENANT_SETTINGS_URL, token, selectedTenantGuid] as const }),
    onSuccess: (settings, _request, context) => {
      // Show the saved values straight away, then refetch every cached copy (any token/tenant).
      if (context) queryClient.setQueryData(context.queryKey, settings);
      return queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_URL] });
    },
  });
}
