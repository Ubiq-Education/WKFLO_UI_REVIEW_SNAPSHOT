import React from 'react';

interface BufferSizeControlProps {
  bufferSize: number;
  onBufferSizeChange: (size: number) => void;
}

const BufferSizeControl: React.FC<BufferSizeControlProps> = ({ 
  bufferSize, 
  onBufferSizeChange 
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = parseInt(e.target.value) || 2;
    onBufferSizeChange(value);
  };


  return (
    <div className="speechbot-buffer-selector">
      <label htmlFor="bufferSizeInput">Audio Buffer Size (chunks):</label>
      <input 
        type="number" 
        id="bufferSizeInput"
        min="1" 
        max="10" 
        value={bufferSize}
        onChange={handleChange}
      />
      <small>Number of audio chunks to buffer before starting playback (1-10)</small>
    </div>
  );
};

export default BufferSizeControl;