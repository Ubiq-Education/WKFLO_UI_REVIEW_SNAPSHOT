import { describe, it, expect } from 'vitest';
import {
  MAX_SELECTED_ITEMS,
  MAX_SELECTED_ITEMS_MESSAGE,
  agentCreateFormSchema,
  agentEditFormSchema,
  toolFormSchema,
} from './entity-form-schemas';

const validTool = {
  name: 'Weather lookup',
  description: 'Looks up the weather for a city',
  type: 'http',
  config: '{}',
};

const validAgentCreate = {
  name: 'Support agent',
  description: 'Answers support questions',
  systemPrompt: 'You are a helpful support agent for the tenant.',
};

const validAgentEdit = {
  ...validAgentCreate,
  additionalInstructions: '',
};

const items = <T,>(count: number, make: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i));

describe('toolFormSchema', () => {
  it('accepts a valid tool', () => {
    expect(toolFormSchema.safeParse(validTool).success).toBe(true);
  });

  it(`accepts exactly ${MAX_SELECTED_ITEMS} tags`, () => {
    const result = toolFormSchema.safeParse({ ...validTool, tags: items(MAX_SELECTED_ITEMS, (i) => `tag-${i}`) });
    expect(result.success).toBe(true);
  });

  it(`rejects ${MAX_SELECTED_ITEMS + 1} tags with the max-items message on the tags path`, () => {
    const result = toolFormSchema.safeParse({ ...validTool, tags: items(MAX_SELECTED_ITEMS + 1, (i) => `tag-${i}`) });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0].path).toEqual(['tags']);
    expect(result.error.issues[0].message).toBe(MAX_SELECTED_ITEMS_MESSAGE);
  });
});

describe('agentCreateFormSchema', () => {
  it('accepts a valid agent create payload', () => {
    expect(agentCreateFormSchema.safeParse(validAgentCreate).success).toBe(true);
  });
});

describe('agentEditFormSchema', () => {
  it('accepts a valid agent edit payload', () => {
    expect(agentEditFormSchema.safeParse(validAgentEdit).success).toBe(true);
  });

  it(`accepts exactly ${MAX_SELECTED_ITEMS} tool ids`, () => {
    const result = agentEditFormSchema.safeParse({ ...validAgentEdit, tools: items(MAX_SELECTED_ITEMS, (i) => i) });
    expect(result.success).toBe(true);
  });

  it(`rejects ${MAX_SELECTED_ITEMS + 1} tool ids with the max-items message on the tools path`, () => {
    const result = agentEditFormSchema.safeParse({
      ...validAgentEdit,
      tools: items(MAX_SELECTED_ITEMS + 1, (i) => i),
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0].path).toEqual(['tools']);
    expect(result.error.issues[0].message).toBe(MAX_SELECTED_ITEMS_MESSAGE);
  });
});
