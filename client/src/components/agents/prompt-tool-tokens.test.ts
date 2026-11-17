import { describe, it, expect } from 'vitest';
import { buildToolPromptSentence, hasToolToken, removeToolTokens } from './prompt-tool-tokens';

describe('prompt tool tokens', () => {
  it('detects tokens by tool id only, whatever the name part', () => {
    expect(hasToolToken('Use {{tool:12:Old name}} please', 12)).toBe(true);
    expect(hasToolToken('Use {{tool:12:Old name}} please', 1)).toBe(false);
    expect(hasToolToken('Use {{tool:123:Other}} please', 12)).toBe(false);
    expect(hasToolToken('', 12)).toBe(false);
  });

  it('gives back the original prompt after removing what Add to Prompt appended', () => {
    const original = 'You are a helpful assistant.\nBe brief.';
    const withTool = `${original}\n\n${buildToolPromptSentence(7, 'Weather API', 'questions about the weather')}`;

    expect(removeToolTokens(withTool, 7)).toBe(original);
  });

  it('removes a generated sentence in the middle together with one blank line', () => {
    const prompt = 'Intro.\n\nUse {{tool:7:Weather}} to reply weather questions.\n\nOutro.';

    expect(removeToolTokens(prompt, 7)).toBe('Intro.\n\nOutro.');
  });

  it('removes every occurrence, including renamed ones, and leaves other tools alone', () => {
    const prompt = [
      'Intro.',
      '',
      'Use {{tool:7:Weather}} to reply weather questions.',
      '',
      'Use {{tool:8:Docs}} to reply document questions.',
      '',
      'Use {{tool:7:Weather (renamed)}} to reply forecasts.',
    ].join('\n');

    expect(removeToolTokens(prompt, 7)).toBe('Intro.\n\nUse {{tool:8:Docs}} to reply document questions.');
  });

  it('cuts an inline token out of other text and tidies the spacing', () => {
    expect(removeToolTokens('Prefer {{tool:7:Weather}} for forecasts.', 7)).toBe('Prefer for forecasts.');
    expect(removeToolTokens('Check the weather with {{tool:7:Weather}}.', 7)).toBe('Check the weather with.');
  });

  it('drops a line that only held the token', () => {
    expect(removeToolTokens('A\n{{tool:7:Weather}}\nB', 7)).toBe('A\nB');
  });

  it('leaves the prompt untouched when the tool is not referenced', () => {
    const prompt = 'Intro.\n\n\nKeep   my spacing.\n';
    expect(removeToolTokens(prompt, 7)).toBe(prompt);
  });

  it('keeps Windows line endings on untouched lines', () => {
    expect(removeToolTokens('A\r\n\r\nUse {{tool:7:W}} to reply x.\r\nB', 7)).toBe('A\r\nB');
  });
});
