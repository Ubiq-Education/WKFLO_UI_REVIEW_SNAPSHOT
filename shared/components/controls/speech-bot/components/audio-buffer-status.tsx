import React from 'react';
import BufferIndicator from './buffer-indicator';

interface AudioBufferStatusProps {
  streamingActive: boolean;
  audioQueueLength: number;
  isPlayingStream: boolean;
  bufferSize: number;
}

const AudioBufferStatus: React.FC<AudioBufferStatusProps> = ({ 
  streamingActive, 
  audioQueueLength, 
  isPlayingStream, 
  bufferSize 
}) => {
  
  return (
    <div className={`speechbot-audio-buffer-status ${streamingActive ? 'speechbot-visible' : ''}`}>
      <strong>🎵 Audio Streaming Buffer:</strong>
      <div>
        Minimum buffer size: <span>{bufferSize}</span> chunks | Current: <span>{audioQueueLength}</span> chunks
      </div>
      <BufferIndicator 
        audioQueueLength={audioQueueLength}
        isPlayingStream={isPlayingStream}
        bufferSize={bufferSize}
      />
    </div>
  );
};

export default AudioBufferStatus;