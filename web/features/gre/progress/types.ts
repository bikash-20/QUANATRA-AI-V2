// Pure type definitions for GRE progress storage. No IDB / Next-only
// imports — kept here so the cached wrapper and unit tests can use the
// `GreProgressRepository` interface without pulling in browser-only deps.

export type QuestionType = "mcq" | "multi" | "qc" | "numeric";

export type UserAnswer =
  | { type: "mcq"; choice: number }
  | { type: "multi"; choices: number[] }
  | { type: "qc"; letter: "A" | "B" | "C" | "D" }
  | { type: "numeric"; value: number };

export type Attempt = {
  id: string;             // "<questionId>:<timestamp>" — first wins
  questionId: string;
  topic: string;
  subtopic: string;
  difficulty: "easy" | "medium" | "hard";
  questionType: QuestionType;
  userAnswer: UserAnswer;
  correct: boolean;
  timeMs: number;
  at: number;             // epoch ms
  fromMock?: string;      // mock id if attempt was part of a mock
};

export type Bookmark = {
  id: string;             // questionId
  questionId: string;
  topic: string;
  createdAt: number;
};

export type VocabStatus = "new" | "learning" | "known";
export type VocabState = {
  id: string;             // wordId
  wordId: string;
  status: VocabStatus;
  // SM-2 lite
  interval: number;       // days
  due: number;            // epoch ms
  reps: number;
  lapses: number;
  lastReviewed?: number;
};

export type RoadmapProgress = {
  id: "default";
  completed: Record<string, true>; // dayKey `${week}.${day}`
  updatedAt: number;
};

export type StreakState = {
  id: "default";
  currentStreak: number;
  longestStreak: number;
  lastActiveDay: string;        // YYYY-MM-DD
  recentDays: Array<{ day: string; correct: number; total: number }>;
};

export type MockState = {
  id: string;                   // mock id
  startedAt: number;
  questionIds: string[];
  answers: Record<string, UserAnswer | undefined>;
  flagged: Record<string, true | undefined>;
  finishedAt?: number;
  autoSubmitted?: boolean;
  result?: { score: number; total: number; timePerQ: number[] };
};

export type Report = {
  id: string;                   // report id
  questionId: string;
  reason: string;
  at: number;
};

// -------------------------------------------------------------------------
// Interface
// -------------------------------------------------------------------------

export interface GreProgressRepository {
  recordAttempt(a: Omit<Attempt, "id">): Promise<Attempt>;
  listAttempts(): Promise<Attempt[]>;
  listAttemptsForQuestion(qid: string): Promise<Attempt[]>;
  isSolved(qid: string): Promise<boolean>;
  firstAttemptFor(qid: string): Promise<Attempt | null>;
  solvedIds(): Promise<Set<string>>;
  attemptedIds(): Promise<Set<string>>;

  toggleBookmark(qid: string, topic: string): Promise<boolean>;
  isBookmarked(qid: string): Promise<boolean>;
  bookmarkedIds(): Promise<Set<string>>;

  getVocabState(wordId: string): Promise<VocabState | null>;
  setVocabState(s: VocabState): Promise<void>;
  listVocabStates(): Promise<VocabState[]>;

  getRoadmap(): Promise<RoadmapProgress>;
  setRoadmapDay(week: number, day: number, done: boolean): Promise<void>;

  getStreak(): Promise<StreakState>;
  recordDayActivity(correct: number, total: number): Promise<StreakState>;

  saveMock(m: MockState): Promise<void>;
  getMock(id: string): Promise<MockState | null>;
  getActiveMock(): Promise<MockState | null>;
  listMocks(): Promise<MockState[]>;
  deleteMock(id: string): Promise<void>;

  reportQuestion(qid: string, reason: string): Promise<Report>;
}