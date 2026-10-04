// GRE progress storage. All client-side; uses the existing IndexedDB
// wrapper. Repository interface so a server-backed implementation can
// replace this without touching components.
//
// Storage rules (per user spec):
//   - Every attempt is stored in greAttempts.
//   - Solved status: any correct attempt -> solved.
//   - Accuracy and weak-topic stats: FIRST attempt per question only.

import { dbDelete, dbGet, dbList, dbPut } from "@/lib/db";

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

export function createVocabStatusUpdate(
  wordId: string,
  status: VocabStatus,
  current: VocabState | undefined
): VocabState {
  const now = Date.now();
  return current
    ? { ...current, status, lastReviewed: now }
    : {
        id: wordId,
        wordId,
        status,
        interval: 0,
        due: now,
        reps: 0,
        lapses: 0,
        lastReviewed: now,
      };
}

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
  // Question ids in order, the user's selection per question, flagged set,
  // and a "submitted" flag. The question list is reconstructed from
  // questionIds; we don't store the question objects.
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

// -------------------------------------------------------------------------
// IndexedDB implementation
// -------------------------------------------------------------------------

const ROADMAP_ID = "default";
const STREAK_ID = "default";
const MOCK_INPROGRESS = "inprogress";

function attemptId(qid: string, at: number): string {
  return `att:${qid}:${at}`;
}

export class IndexedDBGreProgressRepository implements GreProgressRepository {
  async recordAttempt(a: Omit<Attempt, "id">): Promise<Attempt> {
    const attempt: Attempt = { id: attemptId(a.questionId, a.at), ...a };
    await dbPut<Attempt>("greAttempts", attempt);
    await this.recordDayActivity(attempt.correct ? 1 : 0, 1);
    return attempt;
  }

  async listAttempts(): Promise<Attempt[]> {
    const all = await dbList<Attempt>("greAttempts");
    // Sort by at asc
    return all.sort((a, b) => a.at - b.at);
  }

  async listAttemptsForQuestion(qid: string): Promise<Attempt[]> {
    const all = await this.listAttempts();
    return all.filter((a) => a.questionId === qid);
  }

  async isSolved(qid: string): Promise<boolean> {
    const attempts = await this.listAttemptsForQuestion(qid);
    return attempts.some((a) => a.correct);
  }

  async firstAttemptFor(qid: string): Promise<Attempt | null> {
    const attempts = await this.listAttemptsForQuestion(qid);
    return attempts[0] ?? null;
  }

  async solvedIds(): Promise<Set<string>> {
    const attempts = await this.listAttempts();
    const out = new Set<string>();
    for (const a of attempts) if (a.correct) out.add(a.questionId);
    return out;
  }

  async attemptedIds(): Promise<Set<string>> {
    const attempts = await this.listAttempts();
    const out = new Set<string>();
    for (const a of attempts) out.add(a.questionId);
    return out;
  }

  async toggleBookmark(qid: string, topic: string): Promise<boolean> {
    const existing = await dbGet<Bookmark>("greBookmarks", qid);
    if (existing) {
      await dbDelete("greBookmarks", qid);
      return false;
    }
    await dbPut<Bookmark>("greBookmarks", {
      id: qid,
      questionId: qid,
      topic,
      createdAt: Date.now(),
    });
    return true;
  }

  async isBookmarked(qid: string): Promise<boolean> {
    return Boolean(await dbGet("greBookmarks", qid));
  }

  async bookmarkedIds(): Promise<Set<string>> {
    const all = await dbList<Bookmark>("greBookmarks");
    return new Set(all.map((b) => b.questionId));
  }

  async getVocabState(wordId: string): Promise<VocabState | null> {
    return await dbGet<VocabState>("greVocab", wordId);
  }

  async setVocabState(s: VocabState): Promise<void> {
    await dbPut<VocabState>("greVocab", s);
  }

  async listVocabStates(): Promise<VocabState[]> {
    return await dbList<VocabState>("greVocab");
  }

  async getRoadmap(): Promise<RoadmapProgress> {
    const existing = await dbGet<RoadmapProgress>("greRoadmap", ROADMAP_ID);
    return existing ?? { id: ROADMAP_ID, completed: {}, updatedAt: Date.now() };
  }

  async setRoadmapDay(week: number, day: number, done: boolean): Promise<void> {
    const r = await this.getRoadmap();
    const key = `${week}.${day}`;
    if (done) r.completed[key] = true;
    else delete r.completed[key];
    r.updatedAt = Date.now();
    await dbPut<RoadmapProgress>("greRoadmap", r);
  }

  async getStreak(): Promise<StreakState> {
    const existing = await dbGet<StreakState>("greStreak", STREAK_ID);
    return existing ?? {
      id: STREAK_ID,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDay: "",
      recentDays: [],
    };
  }

  async recordDayActivity(correct: number, total: number): Promise<StreakState> {
    const s = await this.getStreak();
    const today = new Date().toISOString().slice(0, 10);
    if (s.lastActiveDay !== today) {
      // Did we miss a day? If so, streak resets to 1 today.
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      if (s.lastActiveDay === yesterday) {
        s.currentStreak += 1;
      } else if (s.lastActiveDay) {
        s.currentStreak = 1;
      } else {
        s.currentStreak = 1;
      }
      s.lastActiveDay = today;
    }
    s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
    const last = s.recentDays[s.recentDays.length - 1];
    if (last && last.day === today) {
      last.correct += correct;
      last.total += total;
    } else {
      s.recentDays.push({ day: today, correct, total });
      if (s.recentDays.length > 30) s.recentDays.shift();
    }
    await dbPut<StreakState>("greStreak", s);
    return s;
  }

  async saveMock(m: MockState): Promise<void> {
    // An "in progress" mock is stored under a special id; a finished one
    // is stored under its own id.
    const existing = await this.getActiveMock();
    if (existing && existing.id !== m.id) {
      // clean up any stale in-progress pointer
      await dbDelete("greMocks", MOCK_INPROGRESS);
    }
    if (!m.finishedAt) {
      await dbPut<MockState>("greMocks", { ...m, id: MOCK_INPROGRESS });
    } else {
      await dbPut<MockState>("greMocks", m);
      // clear the inprogress pointer if it was the same
      await dbDelete("greMocks", MOCK_INPROGRESS);
    }
  }

  async getMock(id: string): Promise<MockState | null> {
    return await dbGet<MockState>("greMocks", id);
  }

  async getActiveMock(): Promise<MockState | null> {
    return await dbGet<MockState>("greMocks", MOCK_INPROGRESS);
  }

  async listMocks(): Promise<MockState[]> {
    const all = await dbList<MockState>("greMocks");
    return all.filter((m) => m.id !== MOCK_INPROGRESS);
  }

  async deleteMock(id: string): Promise<void> {
    await dbDelete("greMocks", id);
  }

  async reportQuestion(qid: string, reason: string): Promise<Report> {
    const report: Report = {
      id: `rep:${qid}:${Date.now()}`,
      questionId: qid,
      reason,
      at: Date.now(),
    };
    await dbPut<Report>("greReports", report);
    return report;
  }
}

// Default export so components can import a singleton.
export const greProgress: GreProgressRepository = new IndexedDBGreProgressRepository();
