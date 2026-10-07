// GRE progress storage. All client-side; uses the existing IndexedDB
// wrapper. Repository interface so a server-backed implementation can
// replace this without touching components.
//
// Storage rules (per user spec):
//   - Every attempt is stored in greAttempts.
//   - Solved status: any correct attempt -> solved.
//   - Accuracy and weak-topic stats: FIRST attempt per question only.
//
// The interface and value types live in ./types.ts so the cached wrapper
// and unit tests can use them without pulling in IDB / "@/" deps.

import { dbDelete, dbGet, dbList, dbPut } from "@/lib/db";

import type {
  Attempt,
  Bookmark,
  GreProgressRepository,
  MockState,
  Report,
  RoadmapProgress,
  StreakState,
  VocabState,
  VocabStatus,
} from "./types";

export type {
  Attempt,
  Bookmark,
  GreProgressRepository,
  MockState,
  QuestionType,
  Report,
  RoadmapProgress,
  StreakState,
  UserAnswer,
  VocabState,
  VocabStatus,
} from "./types";

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

// -------------------------------------------------------------------------
// In-memory memo with revision-based write-invalidation
// -------------------------------------------------------------------------
//
// The cached wrapper lives in ./cached-repository.ts so it can be unit-
// tested under the Node strip-types runner without pulling in IDB / "@/"
// aliases. The default export here wires the wrapper around the IDB impl
// so component callers continue to use the same `greProgress` singleton.

export { CachedGreProgressRepository } from "./cached-repository";
import { CachedGreProgressRepository } from "./cached-repository";

// Default export so components can import a singleton.
export const greProgress: GreProgressRepository = new CachedGreProgressRepository(
  new IndexedDBGreProgressRepository(),
);
