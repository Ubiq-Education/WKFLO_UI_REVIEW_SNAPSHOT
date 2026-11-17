import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Palette, RefreshCw, Eye, EyeOff, Upload, ImageOff, AlertCircle, Plus, Trash2, Sparkles } from 'lucide-react';
import type { ChatSettingsState, PredefinedPrompt } from '@shared/models/chat-settings';
import { chatSettingsToRequest } from '@shared/models/chat-settings';
import useAuth from '@/hooks/use-auth';
import { queryClient } from '@/lib/queryClient';
import { parseErrorMessage } from '@/lib/utils';
import { getTenantName, getTenantHeaders } from '@/lib/tenant-config';
import { config } from '@/lib/config';
import { uploadAgentChatIcon } from '@/services/agent-icon-upload-service';

const ALLOWED_ICON_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_ICON_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — matches the MD API's hard cap; this is a fast-reject UX check only, not a security boundary

interface IconUploadStatus {
  uploading: boolean;
  error: string | null;
}

const idleIconUploadStatus: IconUploadStatus = { uploading: false, error: null };

interface AdvancedChatSettingsPanelProps {
  settings: ChatSettingsState;
  onSettingsChange: (settings: Partial<ChatSettingsState>) => void;
  agentId: string;
  onSave?: (result: any) => void;
  // Gates the "Add MAISY defaults" quick-replies button — callers derive this from
  // agent.tags?.some(t => t.name === 'Maisy'), the same check already used for canSelectFeature.
  isMaisyAgent?: boolean;
}

// Mirrors MaisyDefaultPredefinedPrompts in PetraCMS's ProvisionMaisyAgentCommandHandler —
// keep the two in sync if these defaults ever change.
const MAISY_DEFAULT_PREDEFINED_PROMPTS: PredefinedPrompt[] = [
  {
    title: 'What can MAISY do?',
    prompt: "Please tell me about all the different types of actions the MAISY agent can help me with as I administer my school's website"
  },
  {
    title: 'Improve SEO meta data',
    prompt: 'Please make recommendations for improving the SEO meta data on this page or post'
  },
  {
    title: 'Clone a page or a post',
    prompt: 'Can you clone this page or post for me?'
  },
  {
    title: 'Add images to a gallery',
    prompt: 'Can you help me add images to a gallery on this page?'
  }
];

const colorOptions = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Teal', value: '#14b8a6' },
];

export default function AdvancedChatSettingsPanel({
  settings,
  onSettingsChange,
  agentId,
  onSave,
  isMaisyAgent
}: AdvancedChatSettingsPanelProps) {
  const { toast } = useToast();
  const token = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [bubbleIconUploadStatus, setBubbleIconUploadStatus] = useState<IconUploadStatus>(idleIconUploadStatus);
  const [chatbotIconUploadStatus, setChatbotIconUploadStatus] = useState<IconUploadStatus>(idleIconUploadStatus);
  const [bubbleIconLoadFailed, setBubbleIconLoadFailed] = useState(false);
  const [chatbotIconLoadFailed, setChatbotIconLoadFailed] = useState(false);
  const bubbleIconFileInputRef = useRef<HTMLInputElement>(null);
  const chatbotIconFileInputRef = useRef<HTMLInputElement>(null);

  // Internal form state - starts with the passed settings
  const [formSettings, setFormSettings] = useState<ChatSettingsState>(settings);

  const apiUrl = config.API_URL;

  // Sync form state when external settings change
  useEffect(() => {
    setFormSettings(settings);
  }, [settings]);

  // Reset the "failed to load" flag whenever the underlying URL changes (e.g. after a
  // successful upload writes a new absoluteUrl into the field) — otherwise a stale/broken
  // previous URL that failed to load would leave the preview permanently hidden even once
  // the field points at a brand new, perfectly valid image.
  useEffect(() => {
    setBubbleIconLoadFailed(false);
  }, [formSettings.bubbleIconPath]);

  useEffect(() => {
    setChatbotIconLoadFailed(false);
  }, [formSettings.chatbotIconPath]);

  // Helper function to validate URL format
  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Helper function to check if API Key field has validation error
  const hasApiKeyError = (): boolean => {
    return hasAttemptedSubmit && 
           formSettings.securityType === 'api-key' && 
           !formSettings.apiKeyConfig?.value?.trim();
  };

  const updateFormSetting = <K extends keyof ChatSettingsState>(
    key: K, 
    value: ChatSettingsState[K]
  ) => {
    let newSettings = { ...formSettings, [key]: value };
    
    // If setting security type to api-key, ensure apiKeyConfig has tenantName set from tenant config
    if (key === 'securityType' && value === 'api-key') {
      newSettings = {
        ...newSettings,
        apiKeyConfig: {
          ...newSettings.apiKeyConfig,
          tenantName: getTenantName()
        }
      };
    }
    
    setFormSettings(newSettings);
    // Also update parent to reflect changes in preview
    onSettingsChange(newSettings);
  };

  const updateAzureAdConfig = (field: string, value: string | string[]) => {
    const newSettings = {
      ...formSettings,
      azureAdConfig: {
        ...formSettings.azureAdConfig,
        [field]: value
      }
    };
    setFormSettings(newSettings);
    // Also update parent to reflect changes in preview
    onSettingsChange(newSettings);
  };

  const updateApiKeyConfig = (field: string, value: string | string[]) => {
    const newSettings = {
      ...formSettings,
      apiKeyConfig: {
        ...formSettings.apiKeyConfig,
        [field]: value,
        // Always ensure tenant name is from tenant config
        tenantName: getTenantName()
      }
    };
    setFormSettings(newSettings);
    // Also update parent to reflect changes in preview
    onSettingsChange(newSettings);
  };

  const addPredefinedPrompt = () => {
    updateFormSetting('predefinedPrompts', [
      ...(formSettings.predefinedPrompts || []),
      { title: '', prompt: '' }
    ]);
  };

  const updatePredefinedPrompt = (index: number, field: keyof PredefinedPrompt, value: string) => {
    const updated = (formSettings.predefinedPrompts || []).map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    updateFormSetting('predefinedPrompts', updated);
  };

  const removePredefinedPrompt = (index: number) => {
    updateFormSetting('predefinedPrompts', (formSettings.predefinedPrompts || []).filter((_, i) => i !== index));
  };

  // Additive, not destructive: only appends defaults whose title isn't already present, so
  // clicking this after the admin has already customized/removed some entries never overwrites
  // their edits.
  const addMaisyDefaultPrompts = () => {
    const existing = formSettings.predefinedPrompts || [];
    const missingDefaults = MAISY_DEFAULT_PREDEFINED_PROMPTS.filter(
      (d) => !existing.some((e) => e.title === d.title)
    );
    if (missingDefaults.length === 0) return;
    updateFormSetting('predefinedPrompts', [...existing, ...missingDefaults]);
  };

  const updateJwtConfig = (field: string, value: string | string[]) => {
    const newSettings = {
      ...formSettings,
      jwtConfig: {
        ...formSettings.jwtConfig,
        [field]: value
      }
    };
    setFormSettings(newSettings);
    // Also update parent to reflect changes in preview
    onSettingsChange(newSettings);
  };

  // Shared handler for both icon file pickers ("Bubble Icon URL" / "Chatbot Icon URL").
  // Client-side MIME/size checks here are a fast-reject UX only — the MD API upload
  // endpoint is the authoritative validator (and does the actual resize).
  const handleIconFileSelect = async (
    field: 'bubbleIconPath' | 'chatbotIconPath',
    file: File | null,
    setStatus: React.Dispatch<React.SetStateAction<IconUploadStatus>>
  ) => {
    if (!file) return;

    if (!ALLOWED_ICON_MIME_TYPES.includes(file.type)) {
      setStatus({ uploading: false, error: 'Only PNG, JPEG, or WEBP images are supported.' });
      return;
    }

    if (file.size > MAX_ICON_SIZE_BYTES) {
      setStatus({ uploading: false, error: 'Image must be 5MB or smaller.' });
      return;
    }

    if (!token) {
      setStatus({ uploading: false, error: 'You must be logged in to upload an image.' });
      return;
    }

    const numericAgentId = Number(agentId);
    if (!Number.isFinite(numericAgentId)) {
      setStatus({ uploading: false, error: 'Cannot upload image: agent is not saved yet.' });
      return;
    }

    setStatus({ uploading: true, error: null });

    try {
      const result = await uploadAgentChatIcon(numericAgentId, file, token);
      updateFormSetting(field, result.absoluteUrl);
      setStatus({ uploading: false, error: null });
    } catch (error) {
      setStatus({
        uploading: false,
        error: error instanceof Error ? error.message : 'Failed to upload image.'
      });
    }
  };

  const generateApiKey = () => {
    // Generate a 100-character API key using secure random characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    
    // Use crypto.getRandomValues for secure random generation
    const randomArray = new Uint8Array(100);
    crypto.getRandomValues(randomArray);
    
    for (let i = 0; i < 100; i++) {
      apiKey += chars[randomArray[i] % chars.length];
    }
    
    updateApiKeyConfig('value', apiKey);
    
    toast({
      title: "API Key Generated",
      description: "A new 100-character API key has been generated",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    
    if (!token) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to save chat settings",
        variant: "destructive",
      });
      return;
    }

    // Validate required fields
    if (!formSettings.apiEndpoint.trim()) {
      toast({
        title: "Validation Error",
        description: "API Endpoint is required. Please provide a valid API endpoint URL.",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      new URL(formSettings.apiEndpoint);
    } catch {
      toast({
        title: "Validation Error",
        description: "Please provide a valid URL for the API Endpoint (e.g., https://api.example.com).",
        variant: "destructive",
      });
      return;
    }

    // Validate API Key when security type is api-key
    if (formSettings.securityType === 'api-key') {
      if (!formSettings.apiKeyConfig?.value?.trim()) {
        toast({
          title: "Validation Error",
          description: "API Key Value is required when using API Key authentication.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const requestPayload = chatSettingsToRequest(formSettings);
      
      const response = await fetch(`${apiUrl}/md/api/v1/tenant/agent/${agentId}/chat-setting`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...getTenantHeaders()
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        throw new Error(JSON.stringify(await response.json()));
      }
      if (requestPayload.isWidget) {
        queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}/chat-setting/widget`] });
      }
      else {
        queryClient.invalidateQueries({ queryKey: [`/md/api/v1/tenant/agent/${agentId}/chat-setting/ui`] });
      }

      const result = await response.json();
      
      toast({
        title: "Settings Saved",
        description: "Chat settings have been saved successfully",
      });

      // Reset validation state after successful save
      setHasAttemptedSubmit(false);

      // Settings are already updated via field changes, just call onSave
      onSave?.(result);

    } catch (error) {

      if (!(error instanceof Error)) {
        console.error('Unexpected error type:', error);
        toast({
          title: "Save Failed",
          description: "An unexpected error occurred while saving chat settings.",
          variant: "destructive",
        });
        return;
      }

      const errorDetails = parseErrorMessage(error.message, "Failed to save setting");

      console.error('Error saving chat settings:', errorDetails);
      
      toast({
        title: "Save Failed",
        description: errorDetails.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle className="text-lg">Chat Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
        {/* Visual Styling Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Visual Styling</h3>
          
          {/* Primary Color */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Primary Color</Label>
            <div className="flex items-center gap-3">
              {/* Current Color Preview */}
              <div 
                className="w-10 h-10 rounded-md border-2 border-gray-300 flex-shrink-0"
                style={{ backgroundColor: formSettings.primaryColor }}
              />
              
              {/* Color Picker Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Choose Color
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4">
                  <div className="space-y-4">
                    {/* Preset Colors */}
                    <div>
                      <Label className="text-xs font-medium text-gray-600 mb-2 block">Preset Colors</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {colorOptions.map((color) => (
                          <button
                            key={color.value}
                            type="button"
                            className={`w-8 h-8 rounded-md border-2 hover:scale-110 transition-transform ${
                              formSettings.primaryColor === color.value ? 'border-gray-900 ring-2 ring-gray-400' : 'border-gray-200 hover:border-gray-400'
                            }`}
                            style={{ backgroundColor: color.value }}
                            onClick={() => updateFormSetting('primaryColor', color.value)}
                            title={color.name}
                          />
                        ))}
                      </div>
                    </div>
                    
                    <Separator />
                    
                    {/* Custom Color Input */}
                    <div>
                      <Label className="text-xs font-medium text-gray-600 mb-2 block">Custom Color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label="Primary color picker"
                          value={formSettings.primaryColor}
                          onChange={(e) => updateFormSetting('primaryColor', e.target.value)}
                          className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                        />
                        <Input
                          type="text"
                          aria-label="Primary color hex"
                          value={formSettings.primaryColor}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Basic hex color validation
                            if (/^#[0-9A-Fa-f]{6}$/.test(value) || value === '') {
                              updateFormSetting('primaryColor', value);
                            }
                          }}
                          placeholder="#3b82f6"
                          className="flex-1 text-sm"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Enter a hex color code (e.g., #3b82f6)</p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Current Color Value Display */}
              <span className="text-sm text-gray-600 font-mono">{formSettings.primaryColor}</span>
            </div>
          </div>

          {/* Foreground Color — text & icon color drawn on top of the primary color */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Foreground Color</Label>
            <p className="text-xs text-gray-500">
              Color of the text and icons shown on top of the primary color (header, user message bubbles, send button, launcher). Pick a light or dark value depending on how light your primary color is.
            </p>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-md border-2 border-gray-300 flex-shrink-0 flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: formSettings.primaryColor, color: formSettings.foregroundColor || '#ffffff' }}
              >
                Aa
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={`w-8 h-8 rounded-md border-2 bg-white ${
                    formSettings.foregroundColor === '#ffffff' ? 'border-gray-900 ring-2 ring-gray-400' : 'border-gray-200 hover:border-gray-400'
                  }`}
                  onClick={() => updateFormSetting('foregroundColor', '#ffffff')}
                  title="White"
                />
                <button
                  type="button"
                  className={`w-8 h-8 rounded-md border-2 bg-gray-900 ${
                    formSettings.foregroundColor === '#111827' ? 'border-gray-900 ring-2 ring-gray-400' : 'border-gray-200 hover:border-gray-400'
                  }`}
                  onClick={() => updateFormSetting('foregroundColor', '#111827')}
                  title="Near black"
                />
              </div>

              <input
                type="color"
                aria-label="Foreground color picker"
                value={formSettings.foregroundColor || '#ffffff'}
                onChange={(e) => updateFormSetting('foregroundColor', e.target.value)}
                className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
              />
              <Input
                type="text"
                aria-label="Foreground color hex"
                value={formSettings.foregroundColor || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^#[0-9A-Fa-f]{6}$/.test(value) || value === '') {
                    updateFormSetting('foregroundColor', value);
                  }
                }}
                placeholder="#ffffff"
                className="flex-1 text-sm"
              />
            </div>
          </div>

          {/* Bubble Style */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Message Bubble Style</Label>
            <p className="text-xs text-gray-500">
              Shape of the chat message bubbles inside the conversation.
            </p>
            <Select
              value={formSettings.bubbleStyle}
              onValueChange={(value: 'rounded' | 'square' | 'pill') => updateFormSetting('bubbleStyle', value)}
            >
              <SelectTrigger aria-label="Message Bubble Style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rounded">Rounded</SelectItem>
                <SelectItem value="square">Square</SelectItem>
                <SelectItem value="pill">Pill</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Floating Launcher Settings — only relevant for the floating widget */}
          {formSettings.isWidget && (
            <>
              <Separator />

              <h3 className="text-sm font-semibold text-gray-700">Floating Launcher (closed state)</h3>
              <p className="text-xs text-gray-500 -mt-2">
                Controls the floating button shown before the visitor opens the chat — separate from the message bubble style above.
              </p>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Position</Label>
                <Select
                  value={formSettings.floatingPosition}
                  onValueChange={(value: 'left' | 'right') => updateFormSetting('floatingPosition', value)}
                >
                  <SelectTrigger aria-label="Position">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">Bottom right</SelectItem>
                    <SelectItem value="left">Bottom left</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Launcher Shape</Label>
                <Select
                  value={formSettings.launcherStyle}
                  onValueChange={(value: 'circle' | 'pill') => updateFormSetting('launcherStyle', value)}
                >
                  <SelectTrigger aria-label="Launcher Shape">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="circle">Circle icon</SelectItem>
                    <SelectItem value="pill">Pill with text</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formSettings.launcherStyle === 'pill' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium" htmlFor="launcher-text">Pill Text</Label>
                  <Input
                    id="launcher-text"
                    value={formSettings.launcherText || ''}
                    onChange={(e) => updateFormSetting('launcherText', e.target.value)}
                    placeholder="Can we help?"
                    className="text-sm"
                  />
                </div>
              )}
            </>
          )}

          {/* Show Agent Description */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Show Agent Description</Label>
            <Switch
              aria-label="Show Agent Description"
              checked={formSettings.showAgentDescription}
              onCheckedChange={(checked) => updateFormSetting('showAgentDescription', checked)}
            />
          </div>

          {/* Chain of Thought */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Chain of Thought</Label>
            <Switch
              aria-label="Chain of Thought"
              checked={formSettings.chainOfThought}
              onCheckedChange={(checked) => updateFormSetting('chainOfThought', checked)}
            />
          </div>
        </div>
        
        <Separator />

        {/* Widget Branding */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Widget Branding</h3>

          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="bubble-icon-url">Bubble Icon URL</Label>
            <div className="flex items-start gap-2">
              <div className="w-10 h-10 rounded-md border border-gray-300 flex-shrink-0 flex items-center justify-center overflow-hidden bg-gray-50">
                {formSettings.bubbleIconPath && !bubbleIconLoadFailed ? (
                  <img
                    key={formSettings.bubbleIconPath}
                    src={formSettings.bubbleIconPath}
                    alt="Bubble icon preview"
                    className="w-full h-full object-contain"
                    onError={() => setBubbleIconLoadFailed(true)}
                  />
                ) : (
                  <ImageOff className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <Input
                  id="bubble-icon-url"
                  value={formSettings.bubbleIconPath || ''}
                  onChange={(e) => updateFormSetting('bubbleIconPath', e.target.value)}
                  placeholder="https://cdn.example.com/bubble.png"
                  className="text-sm"
                />
                <input
                  ref={bubbleIconFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={bubbleIconUploadStatus.uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    handleIconFileSelect('bubbleIconPath', file, setBubbleIconUploadStatus);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  disabled={bubbleIconUploadStatus.uploading}
                  onClick={() => bubbleIconFileInputRef.current?.click()}
                >
                  {bubbleIconUploadStatus.uploading ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-1 h-3 w-3" />
                      Upload image
                    </>
                  )}
                </Button>
                {bubbleIconUploadStatus.error && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 flex-shrink-0" />
                    {bubbleIconUploadStatus.error}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="chatbot-icon-url">Chatbot Icon URL</Label>
            <div className="flex items-start gap-2">
              <div className="w-10 h-10 rounded-md border border-gray-300 flex-shrink-0 flex items-center justify-center overflow-hidden bg-gray-50">
                {formSettings.chatbotIconPath && !chatbotIconLoadFailed ? (
                  <img
                    key={formSettings.chatbotIconPath}
                    src={formSettings.chatbotIconPath}
                    alt="Chatbot icon preview"
                    className="w-full h-full object-contain"
                    onError={() => setChatbotIconLoadFailed(true)}
                  />
                ) : (
                  <ImageOff className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <Input
                  id="chatbot-icon-url"
                  value={formSettings.chatbotIconPath || ''}
                  onChange={(e) => updateFormSetting('chatbotIconPath', e.target.value)}
                  placeholder="https://cdn.example.com/chatbot.png"
                  className="text-sm"
                />
                <input
                  ref={chatbotIconFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={chatbotIconUploadStatus.uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    handleIconFileSelect('chatbotIconPath', file, setChatbotIconUploadStatus);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  disabled={chatbotIconUploadStatus.uploading}
                  onClick={() => chatbotIconFileInputRef.current?.click()}
                >
                  {chatbotIconUploadStatus.uploading ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-1 h-3 w-3" />
                      Upload image
                    </>
                  )}
                </Button>
                {chatbotIconUploadStatus.error && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 flex-shrink-0" />
                    {chatbotIconUploadStatus.error}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="custom-css-url">Custom CSS URL</Label>
            <Input
              id="custom-css-url"
              value={formSettings.cssUrl || ''}
              onChange={(e) => updateFormSetting('cssUrl', e.target.value)}
              placeholder="https://cdn.example.com/widget.css"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="header-title">Header Title</Label>
            <p className="text-xs text-gray-500">
              Text shown in the chat header. Falls back to the agent's name when left blank.
            </p>
            <Input
              id="header-title"
              value={formSettings.headerTitle || ''}
              onChange={(e) => updateFormSetting('headerTitle', e.target.value)}
              placeholder="Ask Blue Dog"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="welcome-message">Welcome Message</Label>
            <Textarea
              id="welcome-message"
              value={formSettings.welcomeMessage || ''}
              onChange={(e) => updateFormSetting('welcomeMessage', e.target.value)}
              placeholder="Hi! How can I help you today?"
              className="text-sm min-h-20"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium" htmlFor="footer-message">Footer Message</Label>
            <p className="text-xs text-gray-500">
              Small disclaimer shown below the message input, e.g. an AI accuracy notice or a contact hint.
            </p>
            <Textarea
              id="footer-message"
              value={formSettings.footerMessage || ''}
              onChange={(e) => updateFormSetting('footerMessage', e.target.value)}
              placeholder="This assistant is AI and can make mistakes. Please double-check responses."
              className="text-sm min-h-16"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Quick Replies</Label>
              {isMaisyAgent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMaisyDefaultPrompts}
                  className="text-xs h-7"
                  title="Add the default MAISY quick replies"
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  Add MAISY defaults
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Suggested prompts shown as clickable chips under the welcome message, to help users get started.
            </p>

            <div className="space-y-3">
              {(formSettings.predefinedPrompts || []).map((item, index) => (
                <div key={index} className="space-y-2 rounded-md border border-gray-200 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        aria-label={`Quick reply ${index + 1} title`}
                        value={item.title}
                        onChange={(e) => updatePredefinedPrompt(index, 'title', e.target.value)}
                        placeholder="Title (shown on the button)"
                        className="text-sm"
                      />
                      <Textarea
                        aria-label={`Quick reply ${index + 1} prompt`}
                        value={item.prompt}
                        onChange={(e) => updatePredefinedPrompt(index, 'prompt', e.target.value)}
                        placeholder="Prompt (sent as the message when clicked)"
                        className="text-sm min-h-14"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePredefinedPrompt(index)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                      title="Remove quick reply"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPredefinedPrompt}
              className="text-xs h-7"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add quick reply
            </Button>
          </div>
        </div>

        <Separator />

        {/* API Configuration */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">API Configuration</h3>
          
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              API Endpoint <span className="text-red-500">*</span>
            </Label>
            <Input
              aria-label="API Endpoint"
              value={formSettings.apiEndpoint}
              onChange={(e) => updateFormSetting('apiEndpoint', e.target.value)}
              placeholder="https://api.example.com"
              className={`text-sm ${
                hasAttemptedSubmit && (
                  !formSettings.apiEndpoint.trim() || 
                  (formSettings.apiEndpoint.trim() && !isValidUrl(formSettings.apiEndpoint))
                ) ? 'border-red-300 focus:border-red-500' : ''
              }`}
              required
            />
            {hasAttemptedSubmit && !formSettings.apiEndpoint.trim() ? (
              <p className="text-xs text-red-600">
                API Endpoint is required for chat functionality
              </p>
            ) : hasAttemptedSubmit && formSettings.apiEndpoint.trim() && !isValidUrl(formSettings.apiEndpoint) ? (
              <p className="text-xs text-red-600">
                Please provide a valid URL (e.g., https://api.example.com)
              </p>
            ) : null}
          </div>
        </div>

        <Separator />

        {/* Security Configuration */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Security Configuration</h3>
          
          <div className="space-y-3">
            <Label className="text-sm font-medium">Authentication Type</Label>
            <Select 
              value={formSettings.securityType} 
              onValueChange={(value: 'none' | 'azure-ad' | 'api-key' | 'jwt-token-callback') => updateFormSetting('securityType', value)}
            >
              <SelectTrigger aria-label="Authentication Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="azure-ad">Azure AD</SelectItem>
                <SelectItem value="api-key">API Key</SelectItem>
                <SelectItem value="jwt-token-callback">JWT Token Callback</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Azure AD Configuration */}
          {formSettings.securityType === 'azure-ad' && (
            <div className="space-y-3 pl-4 border-l-2 border-blue-200">
              <Label className="text-sm font-medium text-blue-700">Azure AD Settings</Label>
              
              <div className="space-y-2">
                <Label className="text-xs">Client ID</Label>
                <Input
                  aria-label="Client ID"
                  value={formSettings.azureAdConfig?.clientId || ''}
                  onChange={(e) => updateAzureAdConfig('clientId', e.target.value)}
                  placeholder="your-client-id"
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Tenant ID</Label>
                <Input
                  aria-label="Tenant ID"
                  value={formSettings.azureAdConfig?.tenantId || ''}
                  onChange={(e) => updateAzureAdConfig('tenantId', e.target.value)}
                  placeholder="your-tenant-id"
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Scopes (comma-separated)</Label>
                <Textarea
                  aria-label="Scopes"
                  value={formSettings.azureAdConfig?.scopes?.join(',') || ''}
                  onChange={(e) => updateAzureAdConfig('scopes', e.target.value.split(',').map(s => s.trim()))}
                  placeholder="user.read, openid, profile"
                  className="text-sm min-h-16"
                />
              </div>
            </div>
          )}

          {/* API Key Configuration */}
          {formSettings.securityType === 'api-key' && (
            <div className="space-y-3 pl-4 border-l-2 border-green-200">
              <Label className="text-sm font-medium text-green-700">API Key Settings</Label>
              
              <div className="space-y-2">
                <Label className="text-xs">API Key Value</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      aria-label="API Key Value"
                      value={formSettings.apiKeyConfig?.value || ''}
                      onChange={(e) => updateApiKeyConfig('value', e.target.value)}
                      placeholder="your-api-key"
                      className={`text-sm pr-10 ${hasApiKeyError() ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100"
                      title={showApiKey ? "Hide API key" : "Show API key"}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generateApiKey}
                    className="px-3"
                    title="Generate 100-character API key"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {hasApiKeyError() && (
                  <p className="text-xs text-red-600 mt-1">
                    API Key Value is required
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Tenant Name</Label>
                <Input
                  aria-label="Tenant Name"
                  value={getTenantName()}
                  readOnly
                  className="text-sm bg-gray-50 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500">
                  Tenant name is automatically configured from environment settings
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Tenant Domains  (comma-separated)</Label>
                <Textarea
                  aria-label="Tenant Domains"
                  value={formSettings.apiKeyConfig?.tenantDomains?.join ? (formSettings.apiKeyConfig?.tenantDomains?.join(',')  || '') : ''}
                  onChange={(e) => updateApiKeyConfig('tenantDomains', e.target.value.split(',').map(s => s.trim()))}
                  className="text-sm min-h-16"
                />
              </div>
            </div>
          )}

          {/* JWT Token Callback Configuration */}
          {formSettings.securityType === 'jwt-token-callback' && (
            <div className="space-y-3 pl-4 border-l-2 border-purple-200">
              <Label className="text-sm font-medium text-purple-700">JWT Token Callback Settings</Label>
              
              <div className="space-y-2">
                <Label className="text-xs">Allowed Domains (comma-separated)</Label>
                <Textarea
                  aria-label="Allowed Domains"
                  value={formSettings.jwtConfig?.domains?.join ? (formSettings.jwtConfig?.domains?.join(',') || '') : ''}
                  onChange={(e) => updateJwtConfig('domains', e.target.value.split(',').map(s => s.trim()))}
                  placeholder="example.com, app.example.com"
                  className="text-sm min-h-16"
                />
                <p className="text-xs text-gray-500">
                  Specify domains that are allowed to use JWT token callback authentication
                </p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Chat Settings
              </>
            )}
          </Button>
        </div>
        </form>
      </CardContent>
    </Card>
  );
}