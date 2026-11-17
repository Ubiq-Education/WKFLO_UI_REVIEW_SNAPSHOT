import React from 'react';

interface PlayStopButtonProps {
  isActive: boolean;
  isConnected: boolean;
  isAISpeaking: boolean;
  streamingActive: boolean;
  onStart: () => void;
  onStop: () => void;
  className?: string;
  connectionError?: boolean;
}

const PlayStopButton: React.FC<PlayStopButtonProps> = ({
  isActive,
  isConnected,
  isAISpeaking,
  streamingActive,
  onStart,
  onStop,
  className = '',
  connectionError = false
}) => {
  const handleClick = () => {
    if (isActive) {
      onStop();
    } else {
      onStart();
    }
  };

  const getButtonState = () => {
    if (connectionError) return 'speechbot-error';
    if (!isConnected && !isActive && connectionError) return 'speechbot-error';
    if (streamingActive) return 'speechbot-streaming';
    if (isAISpeaking) return 'speechbot-ai-speaking';
    if (isActive) return 'speechbot-listening';
    if (!isConnected && !isActive) return 'speechbot-inactive';
    return 'speechbot-inactive';
  };

  const getIcon = () => {
    if (connectionError) {
      return (
        <div className="speechbot-exclamation-icon">!</div>
      );
    }
    
    if (isActive) {
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="speechbot-stop-icon">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      );
    } else {
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="speechbot-play-icon">
          <polygon points="8,5 19,12 8,19" />
        </svg>
      );
    }
  };

  const getStatusText = () => {
    if (connectionError) return 'Connection Error';
    if (streamingActive) return 'AI Streaming...';
    if (isAISpeaking) return 'AI Speaking...';
    if (isActive) return 'Listening...';
    if (isConnected) return 'Ready to Chat';
    if (!isConnected && !isActive) return 'Connecting...';
    return 'Connecting...';
  };

  const isErrorState = connectionError;

  return (
    <div className={`speechbot-play-stop-container ${className}`}>
      {isErrorState ? (
        <div className="speechbot-error-tooltip">
          <button
            className={`speechbot-play-stop-button ${getButtonState()}`}
            onClick={handleClick}
            disabled={true}
            aria-label="Connection error - cannot connect to server"
          >
            <div className="speechbot-button-inner">
              <div className="speechbot-icon-container">
                {getIcon()}
              </div>
              <div className="speechbot-ripple-effect"></div>
            </div>
          </button>
          <span className="speechbot-tooltip-text">
            Cannot connect to server. Please check your connection and try again.
          </span>
        </div>
      ) : (
        <button
          className={`speechbot-play-stop-button ${getButtonState()}`}
          onClick={handleClick}
          disabled={!isConnected}
          aria-label={isActive ? 'Stop conversation' : 'Start conversation'}
        >
          <div className="speechbot-button-inner">
            <div className="speechbot-icon-container">
              {getIcon()}
            </div>
            <div className="speechbot-ripple-effect"></div>
          </div>
        </button>
      )}
      
      <div className={`speechbot-status-text ${getButtonState()}`}>
        {getStatusText()}
      </div>
      
      {(streamingActive || isAISpeaking) && (
        <div className="speechbot-audio-indicator">
          <div className="speechbot-wave speechbot-wave-1"></div>
          <div className="speechbot-wave speechbot-wave-2"></div>
          <div className="speechbot-wave speechbot-wave-3"></div>
        </div>
      )}
    </div>
  );
};

export default PlayStopButton;