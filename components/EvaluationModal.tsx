
import React, { useState } from 'react';
import { IELTSScore, TranscriptionItem } from '../types';

interface EvaluationModalProps {
  score: IELTSScore;
  transcriptions?: TranscriptionItem[];
  onClose: () => void;
}

const EvaluationModal: React.FC<EvaluationModalProps> = ({ score, transcriptions, onClose }) => {
  const [showTranscription, setShowTranscription] = useState(false);

  const categories = [
    { name: 'Fluency & Coherence', score: score.fluency, color: 'bg-blue-500' },
    { name: 'Lexical Resource', score: score.lexical, color: 'bg-indigo-500' },
    { name: 'Grammatical Range', score: score.grammar, color: 'bg-purple-500' },
    { name: 'Pronunciation', score: score.pronunciation, color: 'bg-pink-500' },
  ];

  const renderTextWithHighlights = (item: TranscriptionItem) => {
    if (!item.corrections || item.corrections.length === 0) {
      return <span>{item.text}</span>;
    }

    let result: React.ReactNode[] = [];
    let lastIndex = 0;
    const sortedCorrections = [...item.corrections].sort((a, b) => item.text.indexOf(a.error) - item.text.indexOf(b.error));

    sortedCorrections.forEach((corr, i) => {
      const index = item.text.indexOf(corr.error, lastIndex);
      if (index !== -1) {
        result.push(item.text.substring(lastIndex, index));
        result.push(
          <span key={i} className="relative group inline-block">
            <span className="border-b-2 border-red-400 cursor-help bg-red-100/30 px-0.5 rounded">
              {corr.error}
            </span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-[10px] rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <div className="font-black text-red-400 uppercase tracking-widest mb-1">Correction</div>
              <div className="font-bold mb-2">Suggestion: "{corr.suggestion}"</div>
              <div className="opacity-80 italic">{corr.explanation}</div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900"></div>
            </div>
          </span>
        );
        lastIndex = index + corr.error.length;
      }
    });
    result.push(item.text.substring(lastIndex));
    return result;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="p-8 overflow-y-auto flex-1 scrollbar-hide">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">Practice Result</h2>
              <p className="text-sm text-gray-500 font-medium">Detailed performance breakdown</p>
            </div>
            <div className="bg-blue-600 text-white w-20 h-20 rounded-3xl flex flex-col items-center justify-center shadow-xl shadow-blue-200">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Band</span>
              <span className="text-3xl font-black">{score.overall.toFixed(1)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            {categories.map((cat) => (
              <div key={cat.name} className="bg-gray-50 p-5 rounded-3xl border border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{cat.name}</span>
                  <span className="text-lg font-black text-gray-900">{cat.score}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`${cat.color} h-full rounded-full transition-all duration-1000 ease-out`} 
                    style={{ width: `${(cat.score / 9) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-8">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center">
              <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
              Examiner's Feedback
            </h3>
            <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 italic text-gray-700 leading-relaxed">
              "{score.feedback}"
            </div>
          </div>

          {transcriptions && transcriptions.length > 0 && (
            <div className="mb-4">
              <button 
                onClick={() => setShowTranscription(!showTranscription)}
                className="flex items-center space-x-2 text-blue-600 text-xs font-black uppercase tracking-widest hover:text-blue-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${showTranscription ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                </svg>
                <span>{showTranscription ? 'Hide Transcription' : 'Review Full Transcription'}</span>
              </button>

              {showTranscription && (
                <div className="mt-6 space-y-4 border-t border-gray-100 pt-6 animate-fade-in">
                  {transcriptions.map((t, i) => (
                    <div key={i} className={`flex flex-col ${t.type === 'user' ? 'items-end' : 'items-start'}`}>
                      <span className={`text-[9px] font-black uppercase mb-1 px-2 ${t.type === 'user' ? 'text-blue-600' : 'text-gray-400'}`}>
                        {t.type === 'user' ? 'Your Response' : 'Examiner'}
                      </span>
                      <div className={`max-w-[90%] px-5 py-3 rounded-2xl text-xs leading-relaxed ${
                        t.type === 'user' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-900'
                      }`}>
                        {t.type === 'user' ? renderTextWithHighlights(t) : t.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-8 bg-gray-50 border-t border-gray-100">
          <button 
            onClick={onClose}
            className="w-full bg-gray-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl shadow-gray-200 active:scale-[0.98]"
          >
            Close & Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;
