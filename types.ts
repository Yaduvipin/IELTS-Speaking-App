
export interface IELTSScore {
  fluency: number;
  lexical: number;
  grammar: number;
  pronunciation: number;
  overall: number;
  feedback: string;
}

export interface Topic {
  id: string;
  title: string;
  category: string;
  description: string;
  questions: string[];
}

export type SessionState = 'idle' | 'loading' | 'active' | 'evaluating' | 'generating_audio';

export interface GrammarCorrection {
  error: string;
  suggestion: string;
  explanation: string;
}

export interface TranscriptionItem {
  type: 'user' | 'model';
  text: string;
  corrections?: GrammarCorrection[];
  isCheckingGrammar?: boolean;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface PracticeSession {
  id: string;
  topicTitle: string;
  category: string;
  date: string;
  score: IELTSScore;
  transcriptions: TranscriptionItem[];
}
