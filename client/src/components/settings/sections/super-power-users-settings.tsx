import SuperPowerUsersList from "./super-power-users-list";
import TenantAccessList from "./tenant-access-list";

// Global (not tenant-specific) administration of who may see every tenant and use the marketplace
// actions. Only reachable by super power users; the endpoints behind it answer 403 to anyone else.
export default function SuperPowerUsersSettings() {
  return (
    <div className="space-y-6">
      <SuperPowerUsersList />
      <TenantAccessList />
    </div>
  );
}
