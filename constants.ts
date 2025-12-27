
import { Topic } from './types';

export const IELTS_CATEGORIES = [
  'Technology',
  'Environment',
  'Education',
  'Culture',
  'Work & Career',
  'Global Issues'
];

export const SYSTEM_INSTRUCTION = `
You are a world-class IELTS Speaking Examiner. Your goal is to simulate an IELTS Speaking test and provide a detailed evaluation.

Rules for interaction:
1. Conduct the test in three parts (Part 1: Introduction, Part 2: Cue Card, Part 3: Discussion).
2. For this app context, keep the flow conversational and professional.
3. Listen carefully to the user's pronunciation, grammar, and vocabulary usage.
4. When the user signals they are finished (or after a natural conclusion), provide a comprehensive feedback session.

Evaluation Criteria:
- Fluency and Coherence: Logic, pace, and use of connectors.
- Lexical Resource: Range and accuracy of vocabulary.
- Grammatical Range and Accuracy: Variety of structures and error-free sentences.
- Pronunciation: Clarity, intonation, and rhythm.

Always be encouraging but strict on IELTS standards.
`;

export const INITIAL_TOPICS: Topic[] = [
  {
    id: '1',
    category: 'Technology',
    title: 'Artificial Intelligence in Daily Life',
    description: 'Discuss how AI is changing our daily routines.',
    questions: [
      'Do you use any AI tools in your daily life?',
      'How has technology changed the way people work in your country?',
      'Do you think robots will ever replace humans in most jobs?'
    ]
  },
  {
    id: '2',
    category: 'Environment',
    title: 'Sustainable Living',
    description: 'Explore personal and global efforts to protect the environment.',
    questions: [
      'What do you do to help the environment?',
      'Is pollution a big problem in your city?',
      'Whose responsibility is it to protect the environment?'
    ]
  },
  {
    id: '3',
    category: 'Education',
    title: 'The Future of Learning',
    description: 'Discuss online education versus traditional classrooms.',
    questions: [
      'Do you prefer learning online or in a classroom?',
      'What are the qualities of a good teacher?',
      'Should higher education be free for everyone?'
    ]
  }
];
