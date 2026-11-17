import { describe, it, expect } from 'vitest';
import { isMaisyAgent } from './maisy-agent';

describe('isMaisyAgent', () => {
  it('follows the configuration\'s isMaisyAgent', () => {
    expect(isMaisyAgent({ isMaisyAgent: true })).toBe(true);
    expect(isMaisyAgent({ isMaisyAgent: false })).toBe(false);
  });

  it('is false when the configuration has no isMaisyAgent', () => {
    expect(isMaisyAgent({})).toBe(false);
  });
});
