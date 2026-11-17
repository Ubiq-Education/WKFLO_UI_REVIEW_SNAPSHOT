const TENANT_GUID_STORAGE_KEY = 'wkflo.tenantGuid';
const TENANT_NAME_STORAGE_KEY = 'wkflo.tenantName';

// localStorage can throw (private browsing, storage disabled, quota) - persistence is a nice-to-have
// here, never something that should crash tenant selection if it's unavailable.
function readStoredValue(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStoredValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore - see readStoredValue's comment.
  }
}

function removeStoredValue(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore - see readStoredValue's comment.
  }
}

// Tenant configuration utility
class TenantConfig {
  private static instance: TenantConfig;
  private tenantName: string;
  private tenantGuid: string;

  private constructor() {
    // Rehydrate from a previous session so a hard reload keeps whichever tenant the user last
    // selected (see Header's tenant selector) instead of always resetting to the first tenant in
    // the list.
    this.tenantName = readStoredValue(TENANT_NAME_STORAGE_KEY);
    this.tenantGuid = readStoredValue(TENANT_GUID_STORAGE_KEY);
  }

  public static getInstance(): TenantConfig {
    if (!TenantConfig.instance) {
      TenantConfig.instance = new TenantConfig();
    }
    return TenantConfig.instance;
  }

  /**
   * Set the tenant name from various sources
   */
  public setTenantName(tenantName: string): void {
    if (tenantName && tenantName.trim()) {
      this.tenantName = tenantName.trim();
      writeStoredValue(TENANT_NAME_STORAGE_KEY, this.tenantName);
    }
  }

  /**
   * Set the tenant GUID from various sources
   */
  public setTenantGuid(tenantGuid: string): void {
    if (tenantGuid && tenantGuid.trim()) {
      this.tenantGuid = tenantGuid.trim();
      writeStoredValue(TENANT_GUID_STORAGE_KEY, this.tenantGuid);
    }
  }

  /**
   * Forget the selected tenant (memory and localStorage) so no stale tenant header is sent.
   */
  public clearTenant(): void {
    this.tenantName = '';
    this.tenantGuid = '';
    removeStoredValue(TENANT_NAME_STORAGE_KEY);
    removeStoredValue(TENANT_GUID_STORAGE_KEY);
  }

  /**
   * Get the current tenant name
   */
  public getTenantName(): string {
    return this.tenantName;
  }

  /**
   * Get the current tenant GUID
   */
  public getTenantGuid(): string {
    return this.tenantGuid;
  }

  /**
   * Initialize tenant synchronously (if already available in DOM/window)
   * This can be used if the server renders the tenant name into the page
   */
  public async initializeTenant(): Promise<void> {

    const metaTenant = document.querySelector('meta[name="tenant-name"]')?.getAttribute('content');
    if (metaTenant) {
      this.setTenantName(metaTenant);
      const metaTenantGuid = document.querySelector('meta[name="tenant-guid"]')?.getAttribute('content');
      if (metaTenantGuid) {
        this.setTenantGuid(metaTenantGuid);
      }
      console.log(`Tenant initialized from meta tag: ${metaTenant}`);
      return;
    }

    // Check if tenant name is available in global window object
    if ((window as any).TENANT_NAME) {
      this.setTenantName((window as any).TENANT_NAME);
      console.log(`Tenant initialized from window object: ${(window as any).TENANT_NAME}`);
      if ((window as any).TENANT_GUID) {
        this.setTenantGuid((window as any).TENANT_GUID);
      }
      return;
    }
  }

  /**
   * Get tenant headers for API requests
   */
  public getTenantHeaders(): Record<string, string> {
    // The proxy is injecting this header. Discuss in the future this approach.
    return {
      //'amais-wkflo-tenant-name': this.getTenantName(),
      'amais-wkflo-tenant-guid': this.getTenantGuid()
    };
  }
}

// Export singleton instance
export const tenantConfig = TenantConfig.getInstance();

// Convenience functions
export const getTenantName = (): string => tenantConfig.getTenantName();
export const setTenantName = (name: string): void => tenantConfig.setTenantName(name);
export const getTenantGuid = (): string => tenantConfig.getTenantGuid();
export const setTenantGuid = (guid: string): void => tenantConfig.setTenantGuid(guid);
export const clearTenant = (): void => tenantConfig.clearTenant();
export const getTenantHeaders =(): Record<string, string> => tenantConfig.getTenantHeaders();
export const initializeTenant = (): Promise<void> => tenantConfig.initializeTenant();
