import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import useAuth from "@/hooks/use-auth";
import { DataContext } from "@shared/models/chat-models";
import type { TenantWebOrigin } from "@/models/definitions";

export const TENANT_WEB_ORIGINS_URL = "/md/api/v1/tenant/web-origins";

/** Every web origin stored for the selected tenant, including soft-deleted rows (super power users only). */
export function useTenantWebOrigins() {
  const token = useAuth();
  const { selectedTenantGuid } = useContext(DataContext);

  return useQuery<TenantWebOrigin[]>({
    // The tenant guid is part of the key so switching tenants never shows the previous tenant's origins.
    queryKey: [TENANT_WEB_ORIGINS_URL, token, selectedTenantGuid],
    enabled: !!token && !!selectedTenantGuid,
    // Support needs the true stored state, so never serve a cached list on mount.
    refetchOnMount: "always",
  });
}
