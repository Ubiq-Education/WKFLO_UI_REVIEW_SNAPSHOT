import { describe, it, expect, beforeEach, vi } from 'vitest';

// TenantConfig is a module-level singleton that reads localStorage once, in its constructor - each
// test needs a fresh module instance (vi.resetModules + a dynamic re-import) to see a clean read,
// otherwise later tests would just observe whatever the first test's singleton already cached.
async function freshTenantConfigModule() {
  vi.resetModules();
  return await import('./tenant-config');
}

describe('TenantConfig persistence across a hard reload', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts empty when nothing was ever persisted', async () => {
    const { getTenantGuid, getTenantName } = await freshTenantConfigModule();
    expect(getTenantGuid()).toBe('');
    expect(getTenantName()).toBe('');
  });

  it('persists the guid and name to localStorage when set', async () => {
    const { setTenantGuid, setTenantName } = await freshTenantConfigModule();

    setTenantGuid('11111111-1111-1111-1111-111111111111');
    setTenantName('Acme School');

    expect(window.localStorage.getItem('wkflo.tenantGuid')).toBe('11111111-1111-1111-1111-111111111111');
    expect(window.localStorage.getItem('wkflo.tenantName')).toBe('Acme School');
  });

  it('rehydrates the previously selected tenant on a fresh module load (simulating a hard reload)', async () => {
    const first = await freshTenantConfigModule();
    first.setTenantGuid('22222222-2222-2222-2222-222222222222');
    first.setTenantName('Beta School');

    // A hard reload re-executes all module top-level code, including TenantConfig's constructor -
    // resetModules + re-import is the closest a unit test gets to that without an actual reload.
    const reloaded = await freshTenantConfigModule();

    expect(reloaded.getTenantGuid()).toBe('22222222-2222-2222-2222-222222222222');
    expect(reloaded.getTenantName()).toBe('Beta School');
  });

  it('ignores an empty/whitespace-only value instead of overwriting a real persisted one', async () => {
    const { setTenantGuid, getTenantGuid } = await freshTenantConfigModule();
    setTenantGuid('33333333-3333-3333-3333-333333333333');

    setTenantGuid('   ');

    expect(getTenantGuid()).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('clearTenant forgets the guid and name in memory and in localStorage', async () => {
    const { setTenantGuid, setTenantName, clearTenant, getTenantGuid, getTenantName, getTenantHeaders } = await freshTenantConfigModule();
    setTenantGuid('55555555-5555-5555-5555-555555555555');
    setTenantName('Gamma');

    clearTenant();

    expect(getTenantGuid()).toBe('');
    expect(getTenantName()).toBe('');
    expect(getTenantHeaders()['amais-wkflo-tenant-guid']).toBe('');
    expect(window.localStorage.getItem('wkflo.tenantGuid')).toBeNull();
    expect(window.localStorage.getItem('wkflo.tenantName')).toBeNull();
    const reloaded = await freshTenantConfigModule();
    expect(reloaded.getTenantGuid()).toBe('');
  });

  it('does not throw when localStorage.setItem fails(e.g. private browsing/quota)', async () => {
    const { setTenantGuid } = await freshTenantConfigModule();
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => setTenantGuid('44444444-4444-4444-4444-444444444444')).not.toThrow();

    spy.mockRestore();
  });

  it('does not throw when localStorage.getItem fails on load, and just starts empty', async () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const { getTenantGuid } = await freshTenantConfigModule();

    expect(getTenantGuid()).toBe('');
    spy.mockRestore();
  });
});
