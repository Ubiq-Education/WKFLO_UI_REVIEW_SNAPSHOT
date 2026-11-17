import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeChatDisplaySettings } from './chat-settings';

// US 7974: the chat's date/time display settings, with defaults for anything missing or unknown.
describe('normalizeChatDisplaySettings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps valid settings', () => {
    expect(normalizeChatDisplaySettings({ timeZone: 'Europe/London', timeFormat: '12h', dateFormat: 'dd/MM/yyyy' }))
      .toEqual({ timeZone: 'Europe/London', timeFormat: '12h', dateFormat: 'dd/MM/yyyy' });
  });

  it.each([undefined, null, 'not an object', {}])('uses the defaults for %p', (raw) => {
    expect(normalizeChatDisplaySettings(raw)).toEqual({ timeZone: 'UTC', timeFormat: '24h', dateFormat: 'yyyy-MM-dd' });
  });

  it('replaces each unknown value with its default and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(normalizeChatDisplaySettings({ timeZone: 'Mars/Olympus', timeFormat: 'military', dateFormat: 'yy.M.d' }))
      .toEqual({ timeZone: 'UTC', timeFormat: '24h', dateFormat: 'yyyy-MM-dd' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Mars/Olympus'));
  });
});
