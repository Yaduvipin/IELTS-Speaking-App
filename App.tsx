
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Topic, IELTSScore, SessionState, TranscriptionItem } from './types';
import { INITIAL_TOPICS, SYSTEM_INSTRUCTION } from './constants';
import { decode, decodeAudioData, createBlob } from './utils/audioUtils';
import VoiceIndicator from './components/VoiceIndicator';
import EvaluationModal from './components/EvaluationModal';

const App: React.FC = () => {
  const [state, setState] = useState<SessionState>('idle');
  const [topics] = useState<Topic[]>(INITIAL_TOPICS);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [finalScore, setFinalScore] = useState<IELTSScore | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Refs for audio and live session
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const currentTranscriptionRef = useRef<string>('');

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close?.();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    setState('idle');
  }, []);

  const handleStartPractice = async (topic: Topic) => {
    try {
      setState('loading');
      setSelectedTopic(topic);
      setTranscriptions([]);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Setup Audio
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setState('active');
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (state === 'active' || state === 'loading') {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionPromise.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              }
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Audio output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const ctx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Transcriptions
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              setTranscriptions(prev => {
                const last = prev[prev.length - 1];
                if (last?.type === 'model') {
                  return [...prev.slice(0, -1), { type: 'model', text: last.text + text }];
                }
                return [...prev, { type: 'model', text }];
              });
            } else if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              setTranscriptions(prev => {
                const last = prev[prev.length - 1];
                if (last?.type === 'user') {
                  return [...prev.slice(0, -1), { type: 'user', text: last.text + text }];
                }
                return [...prev, { type: 'user', text }];
              });
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => console.error('Live session error:', e),
          onclose: () => stopSession(),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: SYSTEM_INSTRUCTION + `\n\nToday's practice topic is: ${topic.title}. Description: ${topic.description}. Recommended questions: ${topic.questions.join(', ')}`,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (error) {
      console.error('Failed to start session:', error);
      setState('idle');
    }
  };

  const generateEvaluation = async () => {
    if (transcriptions.length < 2) return;
    
    setState('evaluating');
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Evaluate this IELTS speaking practice transcription and provide a JSON result following the structure: {fluency: number, lexical: number, grammar: number, pronunciation: number, overall: number, feedback: string}. Scores must be between 0 and 9 in increments of 0.5.
        
        Transcription:
        ${transcriptions.map(t => `${t.type === 'user' ? 'Student' : 'Examiner'}: ${t.text}`).join('\n')}`,
        config: {
          responseMimeType: "application/json",
        },
      });

      const result = JSON.parse(response.text);
      setFinalScore(result);
      stopSession();
    } catch (error) {
      console.error('Evaluation failed:', error);
      setState('idle');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-80' : 'w-20'} transition-all duration-300 border-r bg-white flex flex-col`}>
        <div className="p-6 border-b flex justify-between items-center">
          <h1 className={`font-black text-xl text-blue-600 ${!isSidebarOpen && 'hidden'}`}>SPEAKMASTER</h1>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isSidebarOpen && <p className="text-xs font-semibold text-gray-400 uppercase px-2 py-2">Daily Practice Tasks</p>}
          {topics.map((topic) => (
            <button
              key={topic.id}
              disabled={state !== 'idle'}
              onClick={() => handleStartPractice(topic)}
              className={`w-full text-left p-4 rounded-xl transition-all ${
                selectedTopic?.id === topic.id 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              } ${state !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="text-xs font-bold opacity-75 mb-1">{topic.category}</div>
              <div className="font-bold truncate">{topic.title}</div>
              {isSidebarOpen && <p className="text-xs mt-1 opacity-80 line-clamp-2">{topic.description}</p>}
            </button>
          ))}
        </div>
        <div className="p-4 bg-gray-50 border-t">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">JD</div>
            {isSidebarOpen && (
              <div>
                <p className="text-sm font-bold text-gray-900">Student User</p>
                <p className="text-xs text-gray-500">IELTS Goal: 7.5+</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {state === 'idle' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="max-w-xl">
              <div className="w-24 h-24 bg-blue-100 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.167a2.405 2.405 0 010-1.592l2.147-6.167a1.76 1.76 0 013.417.592zm3.676 6.88a1 1 0 000-1.524l-1.482-1.076a.477.477 0 00-.758.388v3.137c0 .329.378.506.623.287l1.617-1.212z" />
                </svg>
              </div>
              <h2 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">Master the IELTS Speaking Exam</h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Connect with our AI examiner for real-time conversation. Receive instant feedback and scores based on official IELTS grading criteria.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                {[
                  { title: "Voice First", desc: "Native audio processing for natural dialogue." },
                  { title: "Instant Metrics", desc: "Detailed breakdown of fluency, grammar & more." },
                  { title: "Dynamic Topics", desc: "Fresh contemporary tasks updated daily." },
                  { title: "Exam Simulation", desc: "Full Parts 1-3 timed mock exam experience." }
                ].map((feature, i) => (
                  <div key={i} className="bg-white p-4 rounded-xl border shadow-sm">
                    <h3 className="font-bold text-gray-900 mb-1">{feature.title}</h3>
                    <p className="text-sm text-gray-500">{feature.desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-12 animate-bounce flex flex-col items-center text-blue-600 font-bold text-sm">
                <p>Select a topic to begin practice</p>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mt-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedTopic?.title}</h3>
                <div className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${state === 'active' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
                  <span className="text-sm text-gray-500 font-medium">{state === 'active' ? 'Live Session Active' : 'Connecting to AI Examiner...'}</span>
                </div>
              </div>
              <div className="flex space-x-3">
                <button 
                  onClick={generateEvaluation}
                  disabled={transcriptions.length < 2 || state === 'evaluating'}
                  className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center space-x-2 shadow-lg shadow-blue-200"
                >
                  {state === 'evaluating' ? (
                    <>
                      <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24"></svg>
                      <span>Evaluating...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit for Evaluation</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </>
                  )}
                </button>
                <button 
                  onClick={stopSession}
                  className="bg-red-50 text-red-600 border border-red-100 px-6 py-2 rounded-xl font-bold hover:bg-red-100 transition-all"
                >
                  End Session
                </button>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
              {/* Transcription Area */}
              <div className="lg:col-span-2 bg-white rounded-3xl border shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-500 uppercase">Live Transcription</span>
                  <span className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-600">Syncing...</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {transcriptions.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <p>Start speaking to see your conversation here.</p>
                    </div>
                  ) : (
                    transcriptions.map((t, i) => (
                      <div key={i} className={`flex flex-col ${t.type === 'user' ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase mb-1 px-2">
                          {t.type === 'user' ? 'You' : 'Examiner'}
                        </span>
                        <div className={`max-w-[85%] p-4 rounded-2xl ${
                          t.type === 'user' 
                          ? 'bg-blue-600 text-white shadow-md' 
                          : 'bg-gray-100 text-gray-900 border border-gray-200'
                        }`}>
                          <p className="text-sm leading-relaxed">{t.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Status/Visualizer Side */}
              <div className="bg-white rounded-3xl border shadow-sm p-8 flex flex-col items-center justify-center space-y-12">
                <VoiceIndicator isActive={state === 'active'} label={state === 'active' ? "Examiner is Listening" : "Initializing..."} />
                
                <div className="w-full space-y-6">
                  <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                    <h4 className="font-bold text-blue-900 mb-2">Tips for this Topic:</h4>
                    <ul className="text-sm text-blue-800 space-y-2 list-disc pl-4">
                      <li>Use advanced linking words (Furthermore, Consequently).</li>
                      <li>Try to extend your answers with examples.</li>
                      <li>Avoid repetition; use synonyms for keywords.</li>
                      <li>Speak naturally, don't rush!</li>
                    </ul>
                  </div>

                  <div className="flex flex-col items-center">
                    <p className="text-xs text-gray-400 mb-4">PART 1: INTRO & FAMILIAR TOPICS</p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="w-1/3 h-full bg-blue-600 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Evaluation Result Modal */}
        {finalScore && (
          <EvaluationModal 
            score={finalScore} 
            onClose={() => {
              setFinalScore(null);
              setSelectedTopic(null);
              setTranscriptions([]);
              setState('idle');
            }} 
          />
        )}
      </main>

      {/* Persistent Call to Action (Only mobile or hidden) */}
      <div className="fixed bottom-6 right-6 md:hidden">
        <button 
          className="bg-blue-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center"
          onClick={() => setIsSidebarOpen(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default App;
