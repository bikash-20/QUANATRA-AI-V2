// In-memory memo with revision-based write-invalidation, sitting in front
// of any GreProgressRepository implementation. Pure: no IDB, no Next-only
// imports — so this file can be unit-tested under the Node strip-types
// runner without resolving path aliases or pulling in browser-only deps.
//
// All read methods are memoized for 30s (60s for getRoadmap / getStreak
// since they are queried less often and changes are coarse). Every write
// bumps `revision`, which causes the next access to re-run. Conservative:
// no cross-tab invalidation, no background refresh — just enough to skip
// the IDB read on the second render of a page that already asked.

import type {
  Attempt,
  GreProgressRepository,
  MockState,
  Report,
  RoadmapProgress,
  StreakState,
  VocabState,
} from "./types";

const DEFAULT_TTL_MS = 30_000;
const LONG_TTL_MS = 60_000;

type Entry = { revision: number; value: unknown; expiresAt: number };

export class CachedGreProgressRepository implements GreProgressRepository {
  private revision = 0;
  private cache = new Map<string, Entry>();
  private now: () => number;
  private inner: GreProgressRepository;

  constructor(inner: GreProgressRepository, clock: () => number = () => Date.now()) {
    this.inner = inner;
    this.now = clock;
  }

  private bump(): void {
    this.revision += 1;
    // Drop the entire memo on writes — cheap, and avoids stale partial views
    // when multiple reads share a write signal.
    this.cache.clear();
  }

  private memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = this.now();
    const e = this.cache.get(key);
    if (e && e.revision === this.revision && e.expiresAt > now) {
      return Promise.resolve(e.value as T);
    }
    return load().then((value) => {
      this.cache.set(key, {
        revision: this.revision,
        value,
        expiresAt: this.now() + ttlMs,
      });
      return value;
    });
  }

  // ---- writes -----------------------------------------------------------

  async recordAttempt(a: Omit<Attempt, "id">): Promise<Attempt> {
    const out = await this.inner.recordAttempt(a);
    this.bump();
    return out;
  }

  async toggleBookmark(qid: string, topic: string): Promise<boolean> {
    const out = await this.inner.toggleBookmark(qid, topic);
    this.bump();
    return out;
  }

  async setVocabState(s: VocabState): Promise<void> {
    await this.inner.setVocabState(s);
    this.bump();
  }

  async setRoadmapDay(week: number, day: number, done: boolean): Promise<void> {
    await this.inner.setRoadmapDay(week, day, done);
    this.bump();
  }

  async recordDayActivity(correct: number, total: number): Promise<StreakState> {
    const out = await this.inner.recordDayActivity(correct, total);
    this.bump();
    return out;
  }

  async saveMock(m: MockState): Promise<void> {
    await this.inner.saveMock(m);
    this.bump();
  }

  async deleteMock(id: string): Promise<void> {
    await this.inner.deleteMock(id);
    this.bump();
  }

  async reportQuestion(qid: string, reason: string): Promise<Report> {
    const out = await this.inner.reportQuestion(qid, reason);
    this.bump();
    return out;
  }

  // ---- reads ------------------------------------------------------------

  async listAttempts(): Promise<Attempt[]> {
    return this.memo("list_attempts", DEFAULT_TTL_MS, () => this.inner.listAttempts());
  }

  async listAttemptsForQuestion(qid: string): Promise<Attempt[]> {
    return this.memo(`attempts:${qid}`, DEFAULT_TTL_MS, () => this.inner.listAttemptsForQuestion(qid));
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
    return this.memo("solved_ids", DEFAULT_TTL_MS, () => this.inner.solvedIds());
  }

  async attemptedIds(): Promise<Set<string>> {
    return this.memo("attempted_ids", DEFAULT_TTL_MS, () => this.inner.attemptedIds());
  }

  async isBookmarked(qid: string): Promise<boolean> {
    return this.memo(`bookmarked:${qid}`, DEFAULT_TTL_MS, () => this.inner.isBookmarked(qid));
  }

  async bookmarkedIds(): Promise<Set<string>> {
    return this.memo("bookmarked_ids", DEFAULT_TTL_MS, () => this.inner.bookmarkedIds());
  }

  async getVocabState(wordId: string): Promise<VocabState | null> {
    return this.memo(`vocab:${wordId}`, DEFAULT_TTL_MS, () => this.inner.getVocabState(wordId));
  }

  async listVocabStates(): Promise<VocabState[]> {
    return this.memo("vocab_list", DEFAULT_TTL_MS, () => this.inner.listVocabStates());
  }

  async getRoadmap(): Promise<RoadmapProgress> {
    return this.memo("roadmap", LONG_TTL_MS, () => this.inner.getRoadmap());
  }

  async getStreak(): Promise<StreakState> {
    return this.memo("streak", LONG_TTL_MS, () => this.inner.getStreak());
  }

  async getMock(id: string): Promise<MockState | null> {
    return this.memo(`mock:${id}`, DEFAULT_TTL_MS, () => this.inner.getMock(id));
  }

  async getActiveMock(): Promise<MockState | null> {
    return this.memo("mock:active", DEFAULT_TTL_MS, () => this.inner.getActiveMock());
  }

  async listMocks(): Promise<MockState[]> {
    return this.memo("mocks", DEFAULT_TTL_MS, () => this.inner.listMocks());
  }
}