import { useState, useEffect } from 'react';
import { AgentConfig } from '../../shared/components';
import { WidgetChatInterface } from './components/widget-chat-interface';
import { DataProvider } from '../../shared/provider/data-provider';

function App() {
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    tenantGuid: 'DefaultTenant',
    agentName: 'Demo Agent',
    agentDescription: 'A helpful AI assistant',
    primaryColor: '#3b82f6',
    foregroundColor: '#ffffff',
    bubbleStyle: 'rounded',
    floatingPosition: 'right',
    launcherStyle: 'circle',
    showDescription: true,
    apiEndpoint: '',
    chainOfThought: false,
    isVoiceChatEnabled: false
  });

  useEffect(() => {
    // Parse URL parameters to configure the agent
    const urlParams = new URLSearchParams(window.location.search);
    const agentId = urlParams.get('agentId');
    const tenantGuid = urlParams.get('tenantGuid');
    const agentName = urlParams.get('agentName');
    const agentDescription = urlParams.get('agentDescription');
    const primaryColor = urlParams.get('primaryColor');
    const foregroundColor = urlParams.get('foregroundColor') || undefined;
    const bubbleStyle = urlParams.get('bubbleStyle') as 'rounded' | 'square' | 'pill';
    const floatingPosition = urlParams.get('floatingPosition') as 'left' | 'right';
    const launcherStyle = urlParams.get('launcherStyle') as 'circle' | 'pill';
    const launcherText = urlParams.get('launcherText') || undefined;
    const footerMessage = urlParams.get('footerMessage') || undefined;
    const showDescription = urlParams.get('showDescription') !== 'false';
    const chainOfThought = urlParams.get('chainOfThought') === 'true';
    const isVoiceChatEnabled = urlParams.get('isVoiceChatEnabled') === 'true';
    const apiEndpoint = urlParams.get('apiEndpoint');

    if (agentId || agentName) {
      setAgentConfig({
        tenantGuid: tenantGuid || 'DefaultTenant',
        agentName: agentName || 'Agent',
        agentDescription: agentDescription || 'AI Assistant',
        primaryColor: primaryColor || '#3b82f6',
        foregroundColor: foregroundColor || '#ffffff',
        bubbleStyle: bubbleStyle || 'rounded',
        floatingPosition: floatingPosition || 'right',
        launcherStyle: launcherStyle || 'circle',
        launcherText,
        footerMessage,
        showDescription,
        chainOfThought,
        isVoiceChatEnabled,
        apiEndpoint: apiEndpoint || ''
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <DataProvider>
        <WidgetChatInterface agent={agentConfig} />
      </DataProvider>
    </div>
  );
}

export default App;