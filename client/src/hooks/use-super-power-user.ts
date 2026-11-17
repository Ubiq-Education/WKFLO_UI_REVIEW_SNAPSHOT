import { useQuery } from "@tanstack/react-query";
import useAuth from "@/hooks/use-auth";
import type { MyPermissions } from "@/models/definitions";

export const MY_PERMISSIONS_URL = "/md/api/v1/me/permissions";

const NO_TENANTS: string[] = [];

/**
 * The signed-in user's Super Power User flag and the tenants they may access.
 * UI-only gating: fails closed (not a super power user, no tenants) while loading or on error.
 * Lives in client/src on purpose - the shared package and the chat widget must not depend on it.
 */
export function useSuperPowerUser() {
  const token = useAuth();

  const query = useQuery<MyPermissions>({
    queryKey: [MY_PERMISSIONS_URL, token],
    enabled: !!token,
  });

  return {
    isSuperPowerUser: query.data?.isSuperPowerUser === true,
    accessibleTenantGuids: query.data?.accessibleTenantGuids ?? NO_TENANTS,
    /** True until permissions are known (also while there is no token yet). */
    isLoading: !token || query.isLoading,
    isError: query.isError,
    /** Re-requests the permissions (used by the Retry button when loading them failed). */
    refetch: query.refetch,
};
}
