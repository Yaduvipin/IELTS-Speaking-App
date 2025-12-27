
import React from 'react';

interface VoiceIndicatorProps {
  isActive: boolean;
  volume?: number; // 0 to 1
  label?: string;
}

const VoiceIndicator: React.FC<VoiceIndicatorProps> = ({ isActive, volume = 0, label }) => {
  // Calculate scale based on volume. 1 to 1.5 range.
  const scale = isActive ? 1 + (volume * 0.8) : 1;
  const opacity = isActive ? 0.3 + (volume * 0.7) : 0.2;

  return (
    <div className="flex flex-col items-center justify-center space-y-6">
      <div className="relative w-32 h-32 flex items-center justify-center">
        {isActive && (
          <>
            <div 
              className="absolute w-full h-full border-4 border-blue-400 rounded-full animate-ping opacity-20"
              style={{ transform: `scale(${scale})` }}
            ></div>
            <div 
              className="absolute w-full h-full bg-blue-500 rounded-full transition-transform duration-75"
              style={{ 
                transform: `scale(${scale * 0.9})`,
                opacity: opacity * 0.2
              }}
            ></div>
          </>
        )}
        <div className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${isActive ? 'bg-blue-600 scale-110' : 'bg-gray-200'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-12 w-12 text-white ${isActive && volume > 0.1 ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
      </div>
      <div className="text-center">
        {label && <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{label}</p>}
        {isActive && (
          <div className="flex space-x-1 justify-center h-4 items-end">
            {[1, 2, 3, 4, 5].map((i) => (
              <div 
                key={i} 
                className="w-1 bg-blue-500 rounded-full transition-all duration-100"
                style={{ 
                  height: isActive ? `${Math.max(15, volume * 100 * (1 - i*0.1))} %` : '20%' 
                }}
              ></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceIndicator;
