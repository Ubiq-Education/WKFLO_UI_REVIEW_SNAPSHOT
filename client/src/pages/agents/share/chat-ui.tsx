import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { Agent } from '@shared/schema';
import type { ChatSettingsState, AgentChatSetting } from '@shared/models/chat-settings';
import { defaultChatSettings, chatSettingsFromResult } from '@shared/models/chat-settings';
import useAuth from '@/hooks/use-auth';
import ChatUI from '@/components/agents/chat-ui';
import AdvancedChatSettingsPanel from '@/components/agents/advanced-chat-settings-panel';
import { parseErrorMessage } from '@/lib/utils';
import { DataContext, IInitialState } from '@shared/models/chat-models';
import { getTenantGuid, getTenantHeaders } from '@/lib/tenant-config';
import { config } from '@/lib/config';

export default function AgentChatUIPage() {
  const [match, params] = useRoute("/agents/:id/share/chat-ui");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = useAuth();
  const queryClient = useQueryClient();
  const agentId = match ? params.id : null;

  // Obtain configuration from React context
  const context: IInitialState = useContext(DataContext);

  // Chat settings state aligned with backend model
  const [chatSettings, setChatSettings] = useState<ChatSettingsState>({
    ...defaultChatSettings,
    isWidget: false // This is for regular chat UI, not widget
  });
  const [copied, setCopied] = useState(false);

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: [`/md/api/v1/tenant/agent/${agentId}`, token],
    enabled: !!agentId && !!token,
  });

  // Load existing chat settings
  const { data: existingSettings, isLoading: isLoadingSettings } = useQuery<AgentChatSetting>({
    queryKey: [`/md/api/v1/tenant/agent/${agentId}/chat-setting/ui`, token],
    enabled: !!agentId && !!token,
  });

  // Mutation for updating shareable setting
  const updateShareableMutation = useMutation({
    mutationFn: async (isShareable: boolean) => {
      const apiUrl = config.API_URL || 'http://localhost:5114';
      const response = await fetch(`${apiUrl}/md/api/v1/tenant/agent/${agentId}/chat-setting/sharable`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...getTenantHeaders()
        },
        body: JSON.stringify({ 
          isShareable, 
          isWidget: false,
          primaryColor: chatSettings.primaryColor,
          bubbleStyle: chatSettings.bubbleStyle
        }),
      });

      if (!response.ok) {
        throw new Error(JSON.stringify(await response.json()));
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Shareable setting has been updated successfully",
      });
      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}/chat-setting/ui`] });
    },
    onError: (error: Error) => {
      // Revert the UI state to the opposite value on error
      updateChatSettings({ isShareable: !chatSettings.isShareable });
      
      const errorDetails = parseErrorMessage(error.message, "Failed to update shareable setting");

      toast({
        title: "Error",
        description: errorDetails.message,
        variant: "destructive",
      });
    },
  });

  // Update settings when loaded from backend
  useEffect(() => {
    if (existingSettings) {
      const loadedSettings = chatSettingsFromResult(existingSettings);
      setChatSettings(loadedSettings);
    }
  }, [existingSettings]);

  // Handler for updating chat settings
  const updateChatSettings = (updates: Partial<ChatSettingsState>) => {
    setChatSettings(prev => ({ ...prev, ...updates }));
  };

  // Memoize the security configuration to prevent unnecessary re-renders
  const securityConfig = useMemo(() => {
    if (chatSettings.securityType === "azure-ad") {
      return { 
        type: "azure-ad" as const, 
        azureAd: { 
          clientId: chatSettings.azureAdConfig?.clientId || '',
          tenantId: chatSettings.azureAdConfig?.tenantId || '',
          scopes: chatSettings.azureAdConfig?.scopes || []
        }
      };
    } else if (chatSettings.securityType === "api-key") {
      return { 
        type: "api-key" as const, 
        apiKey: {
          value: chatSettings.apiKeyConfig?.value || '',
          tenantName: chatSettings.apiKeyConfig?.tenantName || ''
        }
      };
    } else if (chatSettings.securityType === "jwt-token-callback") {
      return {
        type: "jwt-token-callback" as const,
        jwt: {
          domains: chatSettings.jwtConfig?.domains || []
        }
      };
    } else {
      return { type: "none" as const };
    }
  }, [
    chatSettings.securityType,
    chatSettings.azureAdConfig?.clientId,
    chatSettings.azureAdConfig?.tenantId,
    chatSettings.azureAdConfig?.scopes,
    chatSettings.apiKeyConfig?.value,
    chatSettings.apiKeyConfig?.tenantName
  ]);

  const apiUrl = config.API_URL;
  const shareableUrl = `${apiUrl}/md/chat/${chatSettings.shareId}`;
  
  const iframeCode = `<iframe
  src="${shareableUrl}"
  width="400"
  height="600"
  frameborder="0"${context.agentChatSettings.isVoiceChatEnabled ? '\n  allow="microphone"' : ''}
></iframe>`;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Code copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  if (!agent) {
    return <div className="p-6">Agent not found</div>;
  }

  // Whether this agent is tagged "Maisy" — also gates the "Add MAISY defaults" quick-replies
  // button below. Used as the "Select feature" button gate for this admin preview: neither
  // this page nor chat-widget.tsx renders <ChatUI> inside a real <iframe> (the only <iframe>
  // markup here is the "Embed Code" text box), so AgentChatInterface's isEmbeddedInIframe()
  // check would otherwise always be false regardless of the agent's tags. Passing this
  // explicit static value bypasses that check — see agent-chat-interface.tsx's
  // canEnterFeatureSelectionMode.
  const isMaisyAgent = agent.tags?.some(t => t.name === 'Maisy') ?? false;

  return (
    <div className="flex-1 p-6 bg-secondary">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/agents/view/${agentId}`)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Agent
          </Button>
          <h1 className="text-2xl font-semibold">Share Agent - Chat UI</h1>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Share Toggle */}
            <Card>
              <CardHeader>
                <CardTitle>Enable Sharing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Make agent shareable</Label>
                    <p className="text-xs text-gray-500 mt-1">
                      Allow external users to access this agent via iframe embed
                    </p>
                  </div>
                  <Switch
                    aria-label="Make agent shareable"
                    checked={chatSettings.isShareable}
                    disabled={updateShareableMutation.isPending}
                    onCheckedChange={(checked) => {
                      updateChatSettings({ isShareable: checked });
                      updateShareableMutation.mutate(checked);
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {chatSettings.isShareable && (
              <>
                {/* Embed Code */}
                <Card>
                  <CardHeader>
                    <CardTitle>Embed Code</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">iframe Embed Code</Label>
                      <div className="relative">
                        <Textarea
                          aria-label="iframe embed code"
                          value={iframeCode}
                          readOnly
                          className="font-mono text-sm min-h-44"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute top-2 right-2"
                          aria-label="Copy embed code"
                          onClick={() => copyToClipboard(iframeCode)}
                        >
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Shareable Link */}
                <Card>
                  <CardHeader>
                    <CardTitle>Shareable Link</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Direct Link</Label>
                      <div className="flex space-x-2">
                        <Input
                          aria-label="Direct link"
                          value={shareableUrl}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          aria-label="Copy shareable link"
                          onClick={() => copyToClipboard(shareableUrl)}
                        >
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Chat Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Chat Preview</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                <ChatUI
                  tenantGuid={getTenantGuid()}
                  agentName={agent.name}
                  agentDescription={agent.description}
                  headerTitle={chatSettings.headerTitle}
                  welcomeMessage={chatSettings.welcomeMessage}
                  primaryColor={chatSettings.primaryColor}
                  foregroundColor={chatSettings.foregroundColor}
                  bubbleStyle={chatSettings.bubbleStyle}
                  footerMessage={chatSettings.footerMessage}
                  predefinedPrompts={chatSettings.predefinedPrompts}
                  bubbleIconPath={chatSettings.bubbleIconPath}
                  chatbotIconPath={chatSettings.chatbotIconPath}
                  cssUrl={chatSettings.cssUrl}
                  showAgentDescription={chatSettings.showAgentDescription}
                  chainOfThought={chatSettings.chainOfThought}
                  isVoiceChatEnabled={false}
                  className='max-w-xl h-chat-xl'
                  isWidget={false} // Regular chat interface
                  shareId={chatSettings.shareId}
                  apiEndpoint={chatSettings.apiEndpoint}
                  securityConfiguration={securityConfig}
                  canSelectFeature={isMaisyAgent}
                />
              </CardContent>
            </Card>
          </div>

          {/* Advanced Chat Settings Panel */}
          <div className="lg:col-span-1">
            <AdvancedChatSettingsPanel
              settings={chatSettings}
              onSettingsChange={updateChatSettings}
              agentId={agentId || ''}
              isMaisyAgent={isMaisyAgent}
              onSave={(result) => {
                toast({
                  title: "Settings Saved",
                  description: "Chat UI settings have been updated successfully",
                });
                // Update shareId if returned from backend
                if (result.shareId) {
                  updateChatSettings({ shareId: result.shareId });
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}