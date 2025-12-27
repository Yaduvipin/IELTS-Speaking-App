
import React, { useState, useEffect, useCallback } from 'react';

interface Part2TimerProps {
  onComplete?: () => void;
}

type Phase = 'idle' | 'preparing' | 'speaking' | 'finished';

const Part2Timer: React.FC<Part2TimerProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [timeLeft, setTimeLeft] = useState(0);

  const startPrep = () => {
    setPhase('preparing');
    setTimeLeft(60);
  };

  const startSpeaking = () => {
    setPhase('speaking');
    setTimeLeft(120);
  };

  const reset = () => {
    setPhase('idle');
    setTimeLeft(0);
  };

  useEffect(() => {
    let timer: number;
    if (phase === 'preparing' || phase === 'speaking') {
      if (timeLeft > 0) {
        timer = window.setInterval(() => {
          setTimeLeft((prev) => prev - 1);
        }, 1000);
      } else {
        if (phase === 'preparing') {
          // Auto transition or wait? Let's wait for user to click "Start Speaking"
          // as they might need a moment to breathe.
        } else {
          setPhase('finished');
          onComplete?.();
        }
      }
    }
    return () => clearInterval(timer);
  }, [phase, timeLeft, onComplete]);

  const getProgress = () => {
    const total = phase === 'preparing' ? 60 : 120;
    return (timeLeft / total) * 100;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 shrink-0 transition-all">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Part 2 Cue Card</h4>
        <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
          phase === 'preparing' ? 'bg-amber-100 text-amber-600' : 
          phase === 'speaking' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
        }`}>
          {phase === 'idle' ? 'Ready' : phase}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-2">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              className="text-gray-100"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (251.2 * getProgress()) / 100}
              className={`transition-all duration-1000 ${
                phase === 'preparing' ? 'text-amber-500' : 'text-blue-600'
              }`}
            />
          </svg>
          <div className="absolute text-xl font-black text-gray-900 tabular-nums">
            {phase === 'idle' ? '--:--' : formatTime(timeLeft)}
          </div>
        </div>

        <div className="mt-6 w-full space-y-2">
          {phase === 'idle' && (
            <button
              onClick={startPrep}
              className="w-full bg-blue-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
            >
              Start 1m Prep
            </button>
          )}
          {phase === 'preparing' && timeLeft > 0 && (
            <button
              onClick={startSpeaking}
              className="w-full bg-green-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-100"
            >
              Skip to Speaking
            </button>
          )}
          {phase === 'preparing' && timeLeft === 0 && (
            <button
              onClick={startSpeaking}
              className="w-full bg-green-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-100"
            >
              Start Speaking (2m)
            </button>
          )}
          {phase === 'speaking' && (
            <button
              onClick={reset}
              className="w-full bg-red-50 text-red-600 py-2 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors"
            >
              Stop & Reset
            </button>
          )}
          {phase === 'finished' && (
            <button
              onClick={reset}
              className="w-full bg-gray-900 text-white py-2 rounded-xl text-xs font-bold hover:bg-black transition-colors"
            >
              Reset Timer
            </button>
          )}
        </div>
      </div>
      
      <p className="text-[9px] text-gray-400 mt-4 text-center leading-relaxed">
        {phase === 'preparing' ? "Use this time to make notes on your prompt." : 
         phase === 'speaking' ? "Talk for at least 1-2 minutes on the topic." : 
         "Standard IELTS timing for Part 2 simulation."}
      </p>
    </div>
  );
};

export default Part2Timer;
