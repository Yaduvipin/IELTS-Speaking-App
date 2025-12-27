
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

export type SessionState = 'idle' | 'loading' | 'active' | 'evaluating';

export interface TranscriptionItem {
  type: 'user' | 'model';
  text: string;
}
