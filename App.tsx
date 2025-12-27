
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { Topic, IELTSScore, SessionState, TranscriptionItem, GroundingChunk, PracticeSession, GrammarCorrection } from './types';
import { INITIAL_TOPICS, SYSTEM_INSTRUCTION, IELTS_CATEGORIES } from './constants';
import { decode, decodeAudioData, createBlob } from './utils/audioUtils';
import VoiceIndicator from './components/VoiceIndicator';
import EvaluationModal from './components/EvaluationModal';
import ExamTimer from './components/ExamTimer';

const App: React.FC = () => {
  const [state, setState] = useState<SessionState>('idle');
  const [view, setView] = useState<'home' | 'history'>('home');
  const [topics] = useState<Topic[]>(INITIAL_TOPICS);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | 'All'>('All');
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [finalScore, setFinalScore] = useState<IELTSScore | null>(null);
  const [history, setHistory] = useState<PracticeSession[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [inputVolume, setInputVolume] = useState(0);
  const [topicInsights, setTopicInsights] = useState<{text: string, sources: GroundingChunk[]} | null>(null);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);
  const [viewingHistorySession, setViewingHistorySession] = useState<PracticeSession | null>(null);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('ielts_speakmaster_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('ielts_speakmaster_history', JSON.stringify(history));
  }, [history]);

  const filteredTopics = useMemo(() => {
    if (selectedCategory === 'All') return topics;
    return topics.filter(t => t.category === selectedCategory);
  }, [topics, selectedCategory]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const volumeAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const checkGrammar = useCallback(async (text: string, index: number) => {
    if (!text.trim() || text.split(' ').length < 3) return;

    setTranscriptions(prev => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], isCheckingGrammar: true };
      return next;
    });

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite-latest',
        contents: `Analyze the following spoken English for grammatical errors. Provide a JSON array of objects, each with "error" (the problematic phrase), "suggestion" (corrected version), and "explanation". If there are no significant errors, return an empty array []. 
        
        Text: "${text}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                error: { type: Type.STRING },
                suggestion: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ['error', 'suggestion', 'explanation']
            }
          }
        }
      });

      const corrections: GrammarCorrection[] = JSON.parse(response.text);
      setTranscriptions(prev => {
        const next = [...prev];
        if (next[index]) {
          next[index] = { 
            ...next[index], 
            corrections: corrections.length > 0 ? corrections : undefined,
            isCheckingGrammar: false 
          };
        }
        return next;
      });
    } catch (e) {
      console.error('Grammar check failed:', e);
      setTranscriptions(prev => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], isCheckingGrammar: false };
        return next;
      });
    }
  }, []);

  const updateVolume = useCallback(() => {
    if (volumeAnalyserRef.current) {
      const dataArray = new Uint8Array(volumeAnalyserRef.current.frequencyBinCount);
      volumeAnalyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setInputVolume(average / 128);
    }
    rafIdRef.current = requestAnimationFrame(updateVolume);
  }, []);

  const stopSession = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
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
    setInputVolume(0);
    setState('idle');
  }, []);

  const handleStartPractice = async (topic: Topic) => {
    try {
      setState('loading');
      setView('home');
      setSelectedTopic(topic);
      setTranscriptions([]);
      setTopicInsights(null);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      volumeAnalyserRef.current = audioContextRef.current.createAnalyser();
      volumeAnalyserRef.current.fftSize = 256;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(volumeAnalyserRef.current);
      updateVolume();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setState('active');
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

            // Trigger grammar check on turn completion
            if (message.serverContent?.turnComplete) {
              setTranscriptions(prev => {
                const lastUserIndex = [...prev].reverse().findIndex(t => t.type === 'user');
                if (lastUserIndex !== -1) {
                  const actualIndex = prev.length - 1 - lastUserIndex;
                  if (!prev[actualIndex].corrections && !prev[actualIndex].isCheckingGrammar) {
                    checkGrammar(prev[actualIndex].text, actualIndex);
                  }
                }
                return prev;
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
          systemInstruction: SYSTEM_INSTRUCTION + `\n\nToday's practice topic is: ${topic.title}. Recommended questions: ${topic.questions.join(', ')}`,
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
        model: 'gemini-3-pro-preview',
        contents: `Evaluate this IELTS speaking practice transcription and provide a JSON result following the structure: {fluency: number, lexical: number, grammar: number, pronunciation: number, overall: number, feedback: string}.
        
        Transcription:
        ${transcriptions.map(t => `${t.type === 'user' ? 'Student' : 'Examiner'}: ${t.text}`).join('\n')}`,
        config: {
          thinkingConfig: { thinkingBudget: 32768 },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fluency: { type: Type.NUMBER },
              lexical: { type: Type.NUMBER },
              grammar: { type: Type.NUMBER },
              pronunciation: { type: Type.NUMBER },
              overall: { type: Type.NUMBER },
              feedback: { type: Type.STRING }
            },
            required: ['fluency', 'lexical', 'grammar', 'pronunciation', 'overall', 'feedback']
          }
        },
      });

      const result = JSON.parse(response.text);
      setFinalScore(result);
      
      const newSession: PracticeSession = {
        id: Date.now().toString(),
        topicTitle: selectedTopic?.title || 'Unknown Topic',
        category: selectedTopic?.category || 'General',
        date: new Date().toLocaleDateString(),
        score: result,
        transcriptions: [...transcriptions]
      };
      setHistory(prev => [newSession, ...prev]);
      
      stopSession();
    } catch (error) {
      console.error('Evaluation failed:', error);
      setState('idle');
    }
  };

  const fetchTopicInsights = async () => {
    if (!selectedTopic) return;
    setIsInsightsLoading(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Provide 3 key facts or recent trends about the topic "${selectedTopic.title}" that could be useful for an IELTS speaking Part 3 discussion.`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      setTopicInsights({ text: response.text, sources: chunks });
    } catch (e) {
      console.error(e);
    } finally {
      setIsInsightsLoading(false);
    }
  };

  const playSampleResponse = async () => {
    if (!selectedTopic) return;
    setState('generating_audio');
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const textResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite-latest',
        contents: `Write a high-scoring (Band 8.5) sample answer for the IELTS question: "${selectedTopic.questions[0]}"`
      });

      const audioResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: textResponse.text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        }
      });

      const base64Audio = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setState('active');
    }
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(s => s.id !== id));
  };

  const clearAllHistory = () => {
    if (window.confirm('Are you sure you want to clear all practice records? This cannot be undone.')) {
      setHistory([]);
      localStorage.removeItem('ielts_speakmaster_history');
    }
  };

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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className={`${isSidebarOpen ? 'w-80' : 'w-20'} transition-all duration-300 border-r bg-white flex flex-col z-20`}>
        <div className="p-6 border-b flex justify-between items-center bg-white sticky top-0">
          <h1 className={`font-black text-xl text-blue-600 ${!isSidebarOpen && 'hidden'}`}>SPEAKMASTER</h1>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {isSidebarOpen && (
          <nav className="p-4 border-b space-y-1">
            <button 
              onClick={() => { setView('home'); setSelectedTopic(null); }}
              className={`w-full flex items-center space-x-3 px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === 'home' && !selectedTopic ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              <span>Dashboard</span>
            </button>
            <button 
              onClick={() => { setView('history'); setSelectedTopic(null); }}
              className={`w-full flex items-center space-x-3 px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === 'history' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>History</span>
            </button>
          </nav>
        )}

        {isSidebarOpen && view === 'home' && (
          <div className="px-4 py-3 border-b bg-white overflow-x-auto whitespace-nowrap scrollbar-hide">
            <div className="flex space-x-2">
              <button onClick={() => setSelectedCategory('All')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selectedCategory === 'All' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>All</button>
              {IELTS_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{cat}</button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isSidebarOpen && view === 'home' && (
            <>
              <p className="text-[10px] font-bold text-gray-400 uppercase px-2 mb-2 tracking-wider">{selectedCategory} Topics ({filteredTopics.length})</p>
              {filteredTopics.map((topic) => (
                <button
                  key={topic.id}
                  disabled={state !== 'idle'}
                  onClick={() => handleStartPractice(topic)}
                  className={`w-full text-left p-4 rounded-xl transition-all group ${selectedTopic?.id === topic.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'} ${state !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`text-[10px] font-bold uppercase mb-1 ${selectedTopic?.id === topic.id ? 'opacity-80' : 'text-blue-500'}`}>{topic.category}</div>
                  <div className="font-bold truncate text-sm">{topic.title}</div>
                </button>
              ))}
            </>
          )}

          {isSidebarOpen && view === 'history' && (
            <>
              <div className="flex justify-between items-center px-2 mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recent Sessions ({history.length})</p>
                {history.length > 0 && (
                  <button onClick={clearAllHistory} className="text-[9px] text-red-500 font-bold hover:underline">Clear All</button>
                )}
              </div>
              {history.length > 0 ? history.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setViewingHistorySession(session)}
                  className="w-full text-left p-4 rounded-xl bg-gray-50 text-gray-700 hover:bg-gray-100 transition-all border border-transparent hover:border-blue-100 group relative"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-blue-500 uppercase">{session.category}</span>
                    <span className="text-[10px] text-gray-400 font-bold">{session.date}</span>
                  </div>
                  <div className="font-bold truncate text-sm pr-4">{session.topicTitle}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                      BAND {session.score.overall.toFixed(1)}
                    </div>
                    <div 
                      onClick={(e) => deleteHistoryItem(e, session.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-gray-400 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </div>
                  </div>
                </button>
              )) : (
                <div className="text-center py-10">
                   <p className="text-xs text-gray-400 italic">No history yet</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden bg-[#F8FAFC]">
        {state === 'idle' && view === 'home' && !selectedTopic ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="max-w-xl animate-fade-in">
              <div className="relative inline-block mb-12">
                <div className="absolute inset-0 bg-blue-400 rounded-3xl blur-2xl opacity-20 animate-pulse"></div>
                <div className="relative w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-6 tracking-tight leading-tight">Master IELTS with <span className="text-blue-600">AI Intelligence</span></h2>
              <p className="text-lg text-gray-600 mb-10 leading-relaxed max-w-lg mx-auto">Real-time voice practice powered by Gemini 2.5 Native Audio and Search Grounding.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-3xl border text-left shadow-sm">
                  <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg></div>
                  <h4 className="font-bold text-gray-900 text-sm mb-1">Deep Evaluation</h4>
                  <p className="text-xs text-gray-500">Gemini 3 Pro thinking mode analyzes your skills based on official criteria.</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border text-left shadow-sm">
                  <div className="w-8 h-8 bg-green-50 text-green-600 rounded-lg flex items-center justify-center mb-4"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg></div>
                  <h4 className="font-bold text-gray-900 text-sm mb-1">Grammar Check</h4>
                  <p className="text-xs text-gray-500">Get instant feedback on your spoken grammar with real-time corrections.</p>
                </div>
              </div>
            </div>
          </div>
        ) : state === 'idle' && view === 'history' ? (
          <div className="flex-1 flex flex-col p-8 overflow-y-auto scrollbar-hide">
            <h2 className="text-3xl font-black text-gray-900 mb-8">Practice History</h2>
            {history.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {history.map(session => (
                  <div 
                    key={session.id} 
                    onClick={() => setViewingHistorySession(session)}
                    className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">{session.category}</span>
                      <span className="text-[10px] font-bold text-gray-400">{session.date}</span>
                    </div>
                    <h3 className="text-lg font-black text-gray-900 mb-6 group-hover:text-blue-600 transition-colors flex-1">{session.topicTitle}</h3>
                    <div className="flex items-end justify-between pt-4 border-t border-gray-50">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Overall Band</p>
                        <p className="text-3xl font-black text-gray-900">{session.score.overall.toFixed(1)}</p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-xl group-hover:bg-blue-50 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-300 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-lg font-bold text-gray-400">Your practice sessions will appear here.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-4 md:p-6 space-y-4 overflow-hidden">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-5 rounded-3xl shadow-sm border border-gray-100 gap-4 shrink-0">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${state === 'active' ? 'bg-green-500 animate-pulse' : 'bg-amber-50'}`}></span>
                  <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{state === 'active' ? 'Live Session' : 'Ready'}</span>
                </div>
                <h3 className="text-xl font-black text-gray-900">{selectedTopic?.title}</h3>
              </div>
              <div className="flex space-x-2">
                <button onClick={playSampleResponse} disabled={state !== 'active'} className="bg-indigo-50 text-indigo-600 px-4 py-2.5 rounded-2xl font-bold hover:bg-indigo-100 text-sm transition-all flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  <span>Hear Sample</span>
                </button>
                <button onClick={generateEvaluation} disabled={transcriptions.length < 2 || state === 'evaluating'} className="bg-blue-600 text-white px-6 py-2.5 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200 text-sm flex items-center space-x-2">
                  {state === 'evaluating' ? 'Analyzing...' : 'Get Final Score'}
                </button>
                <button onClick={stopSession} className="px-4 py-2.5 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all border border-gray-100 text-sm">Cancel</button>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-hidden min-h-0">
              <div className="lg:col-span-3 bg-white rounded-[2rem] border border-gray-100 shadow-sm flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b bg-white flex justify-between items-center shrink-0">
                  <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Live Feed</span>
                  <div className="flex space-x-2">
                    <span className="text-[10px] font-bold bg-green-50 text-green-600 px-2 py-1 rounded">Grammar Check On</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
                  {transcriptions.map((t, i) => (
                    <div key={i} className={`flex flex-col ${t.type === 'user' ? 'items-end' : 'items-start'} animate-fade-in-up`}>
                      <span className={`text-[10px] font-black uppercase mb-1 px-2 ${t.type === 'user' ? 'text-blue-600' : 'text-gray-400'}`}>{t.type === 'user' ? 'You' : 'Examiner'}</span>
                      <div className={`max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed relative ${t.type === 'user' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-900 border border-gray-200'}`}>
                        {t.type === 'user' ? renderTextWithHighlights(t) : t.text}
                        {t.isCheckingGrammar && (
                          <div className="absolute top-1 right-2 animate-pulse text-[8px] opacity-70">
                            Checking...
                          </div>
                        )}
                        {t.type === 'user' && t.corrections && (
                          <div className="mt-2 pt-2 border-t border-blue-400/50 flex items-center space-x-1.5 opacity-80">
                            <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                            <span className="text-[10px] font-bold italic">Grammar check complete</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {transcriptions.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 space-y-4 py-20">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                       <p className="font-bold text-sm">Examiner is connecting. Say 'Hello' when ready.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="hidden lg:flex flex-col space-y-4 overflow-y-auto scrollbar-hide">
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-8 flex flex-col items-center justify-center shrink-0">
                  <VoiceIndicator isActive={state === 'active'} volume={inputVolume} label={state === 'active' ? "Listening..." : "Initializing"} />
                </div>
                
                <ExamTimer isActiveSession={state === 'active'} currentVolume={inputVolume} />
                
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 shrink-0">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Topic Insights</h4>
                    <button onClick={fetchTopicInsights} disabled={isInsightsLoading} className="text-blue-600 text-[10px] font-bold hover:underline">{isInsightsLoading ? 'Searching...' : 'Search Web'}</button>
                  </div>
                  {topicInsights ? (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-600 leading-relaxed italic">"{topicInsights.text}"</p>
                      <div className="pt-2 border-t">
                        <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Sources</p>
                        {topicInsights.sources.map((src, idx) => src.web && (
                          <a key={idx} href={src.web.uri} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-blue-500 hover:underline truncate mb-1">
                            • {src.web.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-400">Click Search Web for real-time grounding data to support your arguments.</p>
                  )}
                </div>

                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2rem] p-6 text-white shadow-xl shadow-blue-100 shrink-0">
                   <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 opacity-80">Quick Strategy</h4>
                   <p className="text-xs leading-relaxed">Hover over highlighted text to see grammar suggestions and improvements.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Evaluation Result Modal */}
        {(finalScore || viewingHistorySession) && (
          <EvaluationModal 
            score={finalScore || viewingHistorySession!.score} 
            transcriptions={finalScore ? transcriptions : viewingHistorySession?.transcriptions}
            onClose={() => {
              setFinalScore(null);
              setViewingHistorySession(null);
              if (state === 'idle') {
                setSelectedTopic(null);
                setTranscriptions([]);
              }
            }} 
          />
        )}
      </main>
    </div>
  );
};

export default App;
