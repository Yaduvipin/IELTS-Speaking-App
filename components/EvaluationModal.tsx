
import React from 'react';
import { IELTSScore } from '../types';

interface EvaluationModalProps {
  score: IELTSScore;
  onClose: () => void;
}

const EvaluationModal: React.FC<EvaluationModalProps> = ({ score, onClose }) => {
  const categories = [
    { name: 'Fluency & Coherence', score: score.fluency, color: 'bg-blue-500' },
    { name: 'Lexical Resource', score: score.lexical, color: 'bg-indigo-500' },
    { name: 'Grammatical Range', score: score.grammar, color: 'bg-purple-500' },
    { name: 'Pronunciation', score: score.pronunciation, color: 'bg-pink-500' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">IELTS Evaluation</h2>
            <div className="bg-blue-600 text-white px-6 py-2 rounded-full text-2xl font-black">
              {score.overall.toFixed(1)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {categories.map((cat) => (
              <div key={cat.name} className="bg-gray-50 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-gray-700">{cat.name}</span>
                  <span className="text-xl font-bold text-gray-900">{cat.score}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className={`${cat.color} h-2.5 rounded-full transition-all duration-1000`} 
                    style={{ width: `${(cat.score / 9) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Examiner's Feedback</h3>
            <p className="text-gray-600 leading-relaxed bg-blue-50 p-6 rounded-xl border border-blue-100 italic">
              "{score.feedback}"
            </p>
          </div>

          <button 
            onClick={onClose}
            className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-black transition-colors"
          >
            Close & Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvaluationModal;
