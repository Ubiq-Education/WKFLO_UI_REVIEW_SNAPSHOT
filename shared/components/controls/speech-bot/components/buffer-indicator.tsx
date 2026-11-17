import React from 'react';

interface BufferIndicatorProps {
  audioQueueLength: number;
  isPlayingStream: boolean;
  bufferSize: number;
}

const BufferIndicator: React.FC<BufferIndicatorProps> = ({ 
  audioQueueLength, 
  isPlayingStream, 
  bufferSize 
}) => {
  const maxChunks: number = Math.max(10, audioQueueLength + (isPlayingStream ? 1 : 0));
  
  return (
    <div className="speechbot-buffer-indicator">
      {Array.from({ length: maxChunks }, (_, i) => {
        let chunkClass = 'speechbot-buffer-chunk';
        
        if (i < audioQueueLength) {
          chunkClass += ' speechbot-filled';
        } else if (i === audioQueueLength && isPlayingStream) {
          chunkClass += ' speechbot-playing';
        }
        
        return <div key={i} className={chunkClass} />;
      })}
    </div>
  );
};

export default BufferIndicator;