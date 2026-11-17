import { useLocation } from "wouter";
import { useContext, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { DataContext } from "@shared/models/chat-models";
import { setTenantGuid, setTenantName, getTenantGuid, clearTenant }from "../../lib/tenant-config";
import useAuth from "../../hooks/use-auth";
import { config } from "../../lib/config";
import { Combobox } from "@/components/ui/combobox";
import { useSuperPowerUser } from "@/hooks/use-super-power-user";

interface Tenant {
  id: string;
  name: string;
  guid: string;
}

export default function Header() {
  // Obtain configuration from React context
  const context = useContext(DataContext);

  const [_, navigate] = useLocation();
  const { instance, accounts } = useMsal();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantGuid, setSelectedTenantGuid] = useState<string>("");
  const [isLoadingTenants, setIsLoadingTenants] = useState(false);
  const [tenantsLoaded, setTenantsLoaded] = useState(false);
  const token = useAuth();
  const { isSuperPowerUser, accessibleTenantGuids, isLoading: isLoadingPermissions } = useSuperPowerUser();

  // UI-only restriction: non-super users only see tenants they have access rows for (fails closed while loading).
  const visibleTenants = useMemo(
    () => (isLoadingPermissions ? [] : isSuperPowerUser ? tenants : tenants.filter(t => accessibleTenantGuids.includes(t.guid))),
    [tenants, isSuperPowerUser, accessibleTenantGuids, isLoadingPermissions]
  );
  const hasNoWorkspaces = !isLoadingPermissions && !isLoadingTenants && tenantsLoaded && visibleTenants.length === 0;
  
  // Header component functionality
  
  const handleLogout = async () => {
    await instance.logoutRedirect({
      account: instance.getActiveAccount() ?? accounts[0],
      onRedirectNavigate: () => false,
    }).catch(e => console.error(e));
  };

  const fetchTenants = async () => {
    if (accounts.length === 0 || !token) return; // Don't fetch if not authenticated
    
    setIsLoadingTenants(true);
    try {
      const apiUrl = config.API_URL;
      
      const response = await fetch(`${apiUrl}/md/api/v1/tenants`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch tenants: ${response.status}`);
      }

      const data = await response.json();
      setTenants(data.data || data); // Handle different response formats
      setTenantsLoaded(true);
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    } finally {
      setIsLoadingTenants(false);
    }
  };

  const handleTenantChange = (selectedGuid: string) => {
    const selectedTenant = visibleTenants.find(t => t.guid === selectedGuid);
    
    if (selectedTenant) {
      setTenantGuid(selectedTenant.guid);
      setTenantName(selectedTenant.name);
      setSelectedTenantGuid(selectedGuid);
      context.updateState({ selectedTenantGuid: selectedGuid });
      console.log(`Tenant switched to: ${selectedTenant.name} (${selectedTenant.guid})`);
    }
  };

  useEffect(() => {
    if (accounts.length > 0) {
      // Only update configuration, preserve runtime state
      context.updateState({
        userName: (instance.getActiveAccount() ?? accounts[0])?.username,
      });
      
      // Fetch tenants when user is authenticated
      fetchTenants();
    }
  }, [accounts, token]);

  // Separate useEffect to set selected tenant after tenants are loaded
  useEffect(() => {
    if (visibleTenants.length > 0) {
      const currentTenantGuid = getTenantGuid();
      if (currentTenantGuid && visibleTenants.some(t => t.guid === currentTenantGuid)) {
        setSelectedTenantGuid(currentTenantGuid);
        context.updateState({ selectedTenantGuid: currentTenantGuid });
      } else {
        // No stored tenant, or the stored tenant is not allowed for this user: fall back to the first allowed one
        const firstTenant = visibleTenants[0];
        setTenantGuid(firstTenant.guid);
        setTenantName(firstTenant.name);
        setSelectedTenantGuid(firstTenant.guid);
        context.updateState({ selectedTenantGuid: firstTenant.guid });
      }
    } else if (hasNoWorkspaces) {
      // Also drop the stored tenant, otherwise getTenantHeaders keeps sending the old guid.
      clearTenant();
      setSelectedTenantGuid("");
      context.updateState({ selectedTenantGuid: "" });
    }
  }, [visibleTenants, hasNoWorkspaces]);

  return (
    <header className="bg-white border-b border-border h-16 flex items-center px-6 p-6">
      <div className="flex items-center">
        <img 
          src="/assets/Wkflo_Logo_Black-11.png"
          alt="Wkflo Logo" 
          className="h-8 mr-6 cursor-pointer" 
          onClick={() => navigate("/")}
        />
      </div>
      
      {/* Tenant Selector */}
      {accounts.length > 0 && (
        <div className="flex items-center ml-6">
          <label htmlFor="tenant-selector" className="mr-2 text-sm font-medium text-gray-700">
            Tenant:
          </label>
          {hasNoWorkspaces ? (
            <span role="status" className="text-sm text-gray-600">
              No workspaces are available. Please contact Support.
            </span>
          ) : (
          <Combobox
            id="tenant-selector"
            options={visibleTenants.map((tenant) => ({ value: tenant.guid, label: tenant.name }))}
            value={selectedTenantGuid}
            onValueChange={handleTenantChange}
            disabled={isLoadingTenants || isLoadingPermissions}
            placeholder={isLoadingTenants ? "Loading..." : "Select a tenant"}
            searchPlaceholder="Search tenants..."
            emptyText="No tenants found."
          />
          )}
        </div>
      )}
      
      {/* Authentication Button */}
      {accounts.length > 0 && (
        <div className="ml-auto flex items-center">
          <span className="mr-3">Hello, {(instance.getActiveAccount() ?? accounts[0])?.name}!</span>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 text-orange-500 rounded hover:text-orange-700 transition-all cursor-pointer"
          >
            Logout
          </button>
        </div>
      )}
    </header>
  );

}