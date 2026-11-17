import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdvancedChatSettingsPanel from './advanced-chat-settings-panel';
import { defaultChatSettings } from '@shared/models/chat-settings';

// Avoid pulling in the real MSAL/DataContext dependency chain — the upload flow only
// needs a truthy token.
vi.mock('@/hooks/use-auth', () => ({
  default: () => 'fake-access-token',
}));

function makeImageFile(name = 'icon.png', type = 'image/png') {
  return new File([new Uint8Array(10)], name, { type });
}

describe('AdvancedChatSettingsPanel — icon upload', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          resultType: 0,
          data: {
            relativePath: 'tenant-a/42/generated-guid.png',
            absoluteUrl: 'https://static.staging.wkflo.ai/tenant-a/42/generated-guid.png',
          },
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('updates the bubble icon preview <img> src after a successful upload', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <AdvancedChatSettingsPanel
        settings={{ ...defaultChatSettings }}
        onSettingsChange={onSettingsChange}
        agentId="42"
      />
    );

    // No bubble icon set yet -> no <img> should be rendered for it.
    expect(screen.queryByAltText('Bubble icon preview')).not.toBeInTheDocument();

    const fileInput = document.querySelector('#bubble-icon-url')!.parentElement!
      .querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    await user.upload(fileInput, makeImageFile());

    await waitFor(() => {
      expect(screen.getByAltText('Bubble icon preview')).toBeInTheDocument();
    });

    const img = screen.getByAltText('Bubble icon preview') as HTMLImageElement;
    expect(img.src).toBe('https://static.staging.wkflo.ai/tenant-a/42/generated-guid.png');

    // The text input mirrors the same state and should reflect the new URL too.
    const textInput = document.querySelector('#bubble-icon-url') as HTMLInputElement;
    expect(textInput.value).toBe('https://static.staging.wkflo.ai/tenant-a/42/generated-guid.png');

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bubbleIconPath: 'https://static.staging.wkflo.ai/tenant-a/42/generated-guid.png',
      })
    );
  });

  it('updates an already-visible icon preview to the newly uploaded URL (re-upload case)', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <AdvancedChatSettingsPanel
        settings={{ ...defaultChatSettings, chatbotIconPath: 'https://cdn.example.com/old-broken.png' }}
        onSettingsChange={onSettingsChange}
        agentId="42"
      />
    );

    const imgBefore = screen.getByAltText('Chatbot icon preview') as HTMLImageElement;
    expect(imgBefore.src).toBe('https://cdn.example.com/old-broken.png');

    // Simulate the old icon URL being broken/unreachable, as could happen with a stale value.
    imgBefore.dispatchEvent(new Event('error'));

    const fileInput = document.querySelector('#chatbot-icon-url')!.parentElement!
      .querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(fileInput, makeImageFile('chatbot.png'));

    await waitFor(() => {
      const img = screen.getByAltText('Chatbot icon preview') as HTMLImageElement;
      expect(img.src).toBe('https://static.staging.wkflo.ai/tenant-a/42/generated-guid.png');
    });

    const imgAfter = screen.getByAltText('Chatbot icon preview') as HTMLImageElement;
    // Must be visible after a successful re-upload, even though the previous src errored.
    expect(imgAfter.style.visibility).not.toBe('hidden');
  });
});

describe('AdvancedChatSettingsPanel — quick replies', () => {
  it('adds a blank quick reply row when "Add quick reply" is clicked', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <AdvancedChatSettingsPanel
        settings={{ ...defaultChatSettings }}
        onSettingsChange={onSettingsChange}
        agentId="42"
      />
    );

    await user.click(screen.getByRole('button', { name: /add quick reply/i }));

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        predefinedPrompts: [{ title: '', prompt: '' }],
      })
    );
  });

  it('edits the title and prompt of an existing quick reply independently', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <AdvancedChatSettingsPanel
        settings={{
          ...defaultChatSettings,
          predefinedPrompts: [
            { title: 'What can you do?', prompt: 'Tell me what you can help with' },
          ],
        }}
        onSettingsChange={onSettingsChange}
        agentId="42"
      />
    );

    const titleInput = screen.getByDisplayValue('What can you do?');
    await user.clear(titleInput);
    await user.type(titleInput, 'Help');

    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        predefinedPrompts: [{ title: 'Help', prompt: 'Tell me what you can help with' }],
      })
    );
  });

  it('removes a quick reply without touching the others', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <AdvancedChatSettingsPanel
        settings={{
          ...defaultChatSettings,
          predefinedPrompts: [
            { title: 'First', prompt: 'First prompt' },
            { title: 'Second', prompt: 'Second prompt' },
          ],
        }}
        onSettingsChange={onSettingsChange}
        agentId="42"
      />
    );

    const removeButtons = screen.getAllByRole('button', { name: /remove quick reply/i });
    await user.click(removeButtons[0]);

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        predefinedPrompts: [{ title: 'Second', prompt: 'Second prompt' }],
      })
    );
  });
});

describe('AdvancedChatSettingsPanel — MAISY defaults button', () => {
  it('is not rendered when isMaisyAgent is false/omitted', () => {
    render(
      <AdvancedChatSettingsPanel
        settings={{ ...defaultChatSettings }}
        onSettingsChange={vi.fn()}
        agentId="42"
      />
    );

    expect(screen.queryByRole('button', { name: /add maisy defaults/i })).not.toBeInTheDocument();
  });

  it('appends all 4 default prompts when clicked with no existing prompts', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <AdvancedChatSettingsPanel
        settings={{ ...defaultChatSettings }}
        onSettingsChange={onSettingsChange}
        agentId="42"
        isMaisyAgent
      />
    );

    await user.click(screen.getByRole('button', { name: /add maisy defaults/i }));

    const lastCall = onSettingsChange.mock.calls[onSettingsChange.mock.calls.length - 1][0];
    expect(lastCall.predefinedPrompts).toHaveLength(4);
    expect(lastCall.predefinedPrompts.map((p: { title: string }) => p.title)).toEqual([
      'What can MAISY do?',
      'Improve SEO meta data',
      'Clone a page or a post',
      'Add images to a gallery',
    ]);
  });

  it('only appends defaults missing by title, leaving existing/customized entries untouched', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();

    render(
      <AdvancedChatSettingsPanel
        settings={{
          ...defaultChatSettings,
          predefinedPrompts: [
            { title: 'What can MAISY do?', prompt: 'A customized prompt the admin already edited' },
            { title: 'My own custom reply', prompt: 'Something unrelated' },
          ],
        }}
        onSettingsChange={onSettingsChange}
        agentId="42"
        isMaisyAgent
      />
    );

    await user.click(screen.getByRole('button', { name: /add maisy defaults/i }));

    const lastCall = onSettingsChange.mock.calls[onSettingsChange.mock.calls.length - 1][0];
    expect(lastCall.predefinedPrompts).toEqual([
      { title: 'What can MAISY do?', prompt: 'A customized prompt the admin already edited' },
      { title: 'My own custom reply', prompt: 'Something unrelated' },
      { title: 'Improve SEO meta data', prompt: 'Please make recommendations for improving the SEO meta data on this page or post' },
      { title: 'Clone a page or a post', prompt: 'Can you clone this page or post for me?' },
      { title: 'Add images to a gallery', prompt: 'Can you help me add images to a gallery on this page?' },
    ]);
  });
});
