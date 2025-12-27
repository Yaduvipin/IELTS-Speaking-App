
import React, { useState, useEffect, useCallback } from 'react';

type ExamPart = 'part1' | 'part2' | 'part3';
type Part2Phase = 'idle' | 'preparing' | 'speaking' | 'finished';

interface ExamTimerProps {
  currentVolume?: number;
  isActiveSession?: boolean;
}

const ExamTimer: React.FC<ExamTimerProps> = ({ currentVolume = 0, isActiveSession = false }) => {
  const [activeTab, setActiveTab] = useState<ExamPart>('part1');
  
  // Part 1 & 3 State (Stopwatch)
  const [p1Time, setP1Time] = useState(0);
  const [p3Time, setP3Time] = useState(0);
  const [isP1Running, setIsP1Running] = useState(false);
  const [isP3Running, setIsP3Running] = useState(false);

  // Part 2 State
  const [p2Phase, setP2Phase] = useState<Part2Phase>('idle');
  const [p2Time, setP2Time] = useState(0);

  // Turn Timer (Helpful for P1 and P3 answer lengths)
  const [turnTime, setTurnTime] = useState(0);
  const isSpeaking = currentVolume > 0.1;

  useEffect(() => {
    let interval: number;
    if (isP1Running) {
      interval = window.setInterval(() => setP1Time(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isP1Running]);

  useEffect(() => {
    let interval: number;
    if (isP3Running) {
      interval = window.setInterval(() => setP3Time(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isP3Running]);

  useEffect(() => {
    let interval: number;
    if (p2Phase === 'preparing' || p2Phase === 'speaking') {
      if (p2Time > 0) {
        interval = window.setInterval(() => setP2Time(t => t - 1), 1000);
      } else if (p2Phase === 'preparing') {
        // Transition or wait? We'll let user click start speaking manually.
      } else {
        setP2Phase('finished');
      }
    }
    return () => clearInterval(interval);
  }, [p2Phase, p2Time]);

  // Turn duration logic
  useEffect(() => {
    let interval: number;
    if (isActiveSession && isSpeaking) {
      interval = window.setInterval(() => setTurnTime(t => t + 1), 1000);
    } else if (!isSpeaking) {
      // Keep the last turn time visible for a few seconds or until next speech
    }
    return () => clearInterval(interval);
  }, [isActiveSession, isSpeaking]);

  // Reset turn timer when speech starts again after a pause
  useEffect(() => {
    if (isSpeaking) {
      setTurnTime(0);
    }
  }, [isSpeaking === true]); // Only reset on start of speech

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderPart1And3 = (part: 'part1' | 'part3') => {
    const time = part === 'part1' ? p1Time : p3Time;
    const isRunning = part === 'part1' ? isP1Running : isP3Running;
    const setIsRunning = part === 'part1' ? setIsP1Running : setIsP3Running;
    const setTime = part === 'part1' ? setP1Time : setP3Time;

    const targetMax = 300; // 5 minutes
    const progress = Math.min((time / targetMax) * 100, 100);

    return (
      <div className="flex flex-col items-center animate-fade-in">
        <div className="relative w-24 h-24 flex items-center justify-center mb-6">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-100" />
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (251.2 * progress) / 100}
              className={`transition-all duration-1000 ${time > 240 ? 'text-amber-500' : 'text-blue-600'}`}
            />
          </svg>
          <div className="absolute text-xl font-black text-gray-900 tabular-nums">{formatTime(time)}</div>
        </div>

        <div className="flex space-x-2 w-full">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
              isRunning ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-blue-600 text-white shadow-blue-100'
            }`}
          >
            {isRunning ? 'Pause' : 'Start Timer'}
          </button>
          <button
            onClick={() => { setIsRunning(false); setTime(0); }}
            className="px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 border border-gray-100 transition-colors"
          >
            Reset
          </button>
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-xl w-full border border-gray-100">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Guidelines</p>
          <ul className="text-[10px] space-y-1.5 text-gray-600 font-medium">
            <li className="flex items-start">
              <span className="w-1 h-1 bg-blue-400 rounded-full mt-1.5 mr-2 shrink-0"></span>
              <span>Total Duration: 4-5 minutes</span>
            </li>
            <li className="flex items-start">
              <span className="w-1 h-1 bg-blue-400 rounded-full mt-1.5 mr-2 shrink-0"></span>
              <span>Answer Length: {part === 'part1' ? '2-3 sentences (20s)' : '4-6 sentences (45s)'}</span>
            </li>
          </ul>
        </div>
      </div>
    );
  };

  const renderPart2 = () => {
    const progress = p2Phase === 'preparing' ? (p2Time / 60) * 100 : (p2Time / 120) * 100;
    
    return (
      <div className="flex flex-col items-center animate-fade-in">
        <div className="relative w-24 h-24 flex items-center justify-center mb-6">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-100" />
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (251.2 * progress) / 100}
              className={`transition-all duration-1000 ${p2Phase === 'preparing' ? 'text-amber-500' : 'text-blue-600'}`}
            />
          </svg>
          <div className="absolute text-xl font-black text-gray-900 tabular-nums">
            {p2Phase === 'idle' ? '--:--' : formatTime(p2Time)}
          </div>
        </div>

        <div className="w-full space-y-2">
          {p2Phase === 'idle' && (
            <button onClick={() => { setP2Phase('preparing'); setP2Time(60); }} className="w-full bg-blue-600 text-white py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-100">Start 1m Prep</button>
          )}
          {p2Phase === 'preparing' && (
            <button onClick={() => { setP2Phase('speaking'); setP2Time(120); }} className="w-full bg-green-600 text-white py-2 rounded-xl text-xs font-bold shadow-lg shadow-green-100">Skip to Speaking</button>
          )}
          {p2Phase === 'speaking' && (
            <button onClick={() => setP2Phase('idle')} className="w-full bg-red-50 text-red-600 py-2 rounded-xl text-xs font-bold">Stop & Reset</button>
          )}
          {p2Phase === 'finished' && (
            <button onClick={() => setP2Phase('idle')} className="w-full bg-gray-900 text-white py-2 rounded-xl text-xs font-bold">Reset Timer</button>
          )}
        </div>

        <div className="mt-4 text-center">
            <p className="text-[9px] text-gray-400 leading-relaxed italic">
              Prep for 1 minute, then speak for up to 2 minutes on the cue card.
            </p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 shrink-0">
      <div className="flex p-1 bg-gray-50 rounded-2xl mb-6">
        {(['part1', 'part2', 'part3'] as ExamPart[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.replace('part', 'P')}
          </button>
        ))}
      </div>

      <div className="min-h-[180px]">
        {activeTab === 'part1' && renderPart1And3('part1')}
        {activeTab === 'part2' && renderPart2()}
        {activeTab === 'part3' && renderPart1And3('part3')}
      </div>

      {isActiveSession && turnTime > 0 && (
        <div className="mt-4 pt-4 border-t border-dashed border-gray-100 flex justify-between items-center animate-fade-in">
          <span className="text-[10px] font-bold text-gray-400 uppercase">Current Turn</span>
          <span className={`text-xs font-black ${turnTime > (activeTab === 'part1' ? 30 : 60) ? 'text-red-500' : 'text-blue-600'}`}>
            {formatTime(turnTime)}
          </span>
        </div>
      )}
    </div>
  );
};

export default ExamTimer;
