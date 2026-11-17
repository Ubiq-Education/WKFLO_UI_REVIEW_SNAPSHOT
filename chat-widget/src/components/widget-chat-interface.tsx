import React from 'react';
import { AgentChatInterface, AgentConfig } from '../../../shared/components';

interface WidgetChatInterfaceProps {
  agent: AgentConfig;
  onClose?: () => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
}

export const WidgetChatInterface: React.FC<WidgetChatInterfaceProps> = (props) => {
  return (
    <AgentChatInterface 
      {...props}
      isWidget={true}
    />
  );
};