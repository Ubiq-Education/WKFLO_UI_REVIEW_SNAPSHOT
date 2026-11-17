import React from 'react';

interface ConsoleDisplayProps {
  messages: string[];
}

const ConsoleDisplay: React.FC<ConsoleDisplayProps> = ({ messages }) => {
  
  return (
    <div className="speechbot-console-message">
      {messages.map((message, index) => (
        <div key={index}>{message}</div>
      ))}
    </div>
  );
};

export default ConsoleDisplay;