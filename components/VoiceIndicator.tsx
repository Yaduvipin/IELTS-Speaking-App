
import React from 'react';

interface VoiceIndicatorProps {
  isActive: boolean;
  label?: string;
}

const VoiceIndicator: React.FC<VoiceIndicatorProps> = ({ isActive, label }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="relative w-24 h-24 flex items-center justify-center">
        {isActive && <div className="pulse-ring"></div>}
        <div className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-colors duration-500 ${isActive ? 'bg-blue-600' : 'bg-gray-300'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-10 w-10 text-white ${isActive ? 'animate-bounce' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
      </div>
      {label && <p className="text-sm font-medium text-gray-500 uppercase tracking-widest">{label}</p>}
    </div>
  );
};

export default VoiceIndicator;
