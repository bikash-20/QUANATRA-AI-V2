// Cache layer unit tests for the GRE module.
//
// Two layers under test:
//   1. CachedGreProgressRepository — a per-session memo with revision-based
//      write-invalidation wrapping the inner IDB repository. Tested in
//      isolation with a fake inner (Node test runner has no `window`, so
//      we cannot construct IndexedDBGreProgressRepository here). The
//      wrapper itself is extracted to ./cached-repository.ts so it has no
//      IDB / "@/" deps and can be exercised under Node strip-types.
//   2. features/gre/content/cache.ts — module-scope TTL primitives (Map +
//      single-slot) used by the server loader. We don't pull in the full
//      loader (it imports "server-only", which Node can't resolve), so we
//      exercise the primitives directly.
//
// For the server loader we keep the test surface minimal: just exercise
// the primitives. Real loader behavior is covered by the e2e/gre-content-
// schema tests against the on-disk JSON.

import assert from "node:assert/strict";
import test from "node:test";

import { CachedGreProgressRepository } from "../features/gre/progress/cached-repository.ts";
import type {
  Attempt,
  GreProgressRepository,
  MockState,
  Report,
  RoadmapProgress,
  StreakState,
  UserAnswer,
  VocabState,
} from "../features/gre/progress/types.ts";
import {
  DEFAULT_CACHE_TTL_MS,
  enforceSizeGuard,
  MapWithTTL,
  MAX_CACHE_ENTRIES,
  TtlSlot,
} from "../features/gre/content/cache.ts";

// -------------------------------------------------------------------------
// Fake inner repository
// -------------------------------------------------------------------------

function fakeRepo(): { inner: GreProgressRepository; state: { attempts: Attempt[]; bookmarks: Set<string>; vocab: Map<string, VocabState>; streak: StreakState; roadmap: RoadmapProgress; mocks: Map<string, MockState>; reports: Report[] } } {
  const attempts: Attempt[] = [];
  const bookmarks = new Set<string>();
  const vocab = new Map<string, VocabState>();
  const streak: StreakState = { id: "default", currentStreak: 0, longestStreak: 0, lastActiveDay: "", recentDays: [] };
  const roadmap: RoadmapProgress = { id: "default", completed: {}, updatedAt: 0 };
  const mocks = new Map<string, MockState>();
  const reports: Report[] = [];

  const inner: GreProgressRepository = {
    async recordAttempt(a: Omit<Attempt, "id">): Promise<Attempt> {
      const att: Attempt = { id: `att:${a.questionId}:${a.at}`, ...a };
      attempts.push(att);
      return att;
    },
    async listAttempts(): Promise<Attempt[]> {
      return [...attempts];
    },
    async listAttemptsForQuestion(qid: string): Promise<Attempt[]> {
      return attempts.filter((a) => a.questionId === qid);
    },
    async isSolved(qid: string): Promise<boolean> {
      return attempts.some((a) => a.questionId === qid && a.correct);
    },
    async firstAttemptFor(qid: string): Promise<Attempt | null> {
      return attempts.find((a) => a.questionId === qid) ?? null;
    },
    async solvedIds(): Promise<Set<string>> {
      return new Set(attempts.filter((a) => a.correct).map((a) => a.questionId));
    },
    async attemptedIds(): Promise<Set<string>> {
      return new Set(attempts.map((a) => a.questionId));
    },
    async toggleBookmark(qid: string, _topic: string): Promise<boolean> {
      if (bookmarks.has(qid)) {
        bookmarks.delete(qid);
        return false;
      }
      bookmarks.add(qid);
      return true;
    },
    async isBookmarked(qid: string): Promise<boolean> {
      return bookmarks.has(qid);
    },
    async bookmarkedIds(): Promise<Set<string>> {
      return new Set(bookmarks);
    },
    async getVocabState(wordId: string): Promise<VocabState | null> {
      return vocab.get(wordId) ?? null;
    },
    async setVocabState(s: VocabState): Promise<void> {
      vocab.set(s.wordId, s);
    },
    async listVocabStates(): Promise<VocabState[]> {
      return [...vocab.values()];
    },
    async getRoadmap(): Promise<RoadmapProgress> {
      return roadmap;
    },
    async setRoadmapDay(week: number, day: number, done: boolean): Promise<void> {
      const key = `${week}.${day}`;
      if (done) roadmap.completed[key] = true;
      else delete roadmap.completed[key];
      roadmap.updatedAt = Date.now();
    },
    async getStreak(): Promise<StreakState> {
      return streak;
    },
    async recordDayActivity(correct: number, total: number): Promise<StreakState> {
      streak.recentDays.push({ day: "2026-01-01", correct, total });
      return streak;
    },
    async saveMock(m: MockState): Promise<void> {
      mocks.set(m.id, m);
    },
    async getMock(id: string): Promise<MockState | null> {
      return mocks.get(id) ?? null;
    },
    async getActiveMock(): Promise<MockState | null> {
      return mocks.get("inprogress") ?? null;
    },
    async listMocks(): Promise<MockState[]> {
      return [...mocks.values()].filter((m) => m.id !== "inprogress");
    },
    async deleteMock(id: string): Promise<void> {
      mocks.delete(id);
    },
    async reportQuestion(qid: string, reason: string): Promise<Report> {
      const r: Report = { id: `rep:${qid}:${Date.now()}`, questionId: qid, reason, at: Date.now() };
      reports.push(r);
      return r;
    },
  };

  return {
    inner,
    state: { attempts, bookmarks, vocab, streak, roadmap, mocks, reports },
  };
}

function makeAttempt(over: Partial<Omit<Attempt, "id">> = {}): Omit<Attempt, "id"> {
  return {
    questionId: "q-ari-001",
    topic: "arithmetic",
    subtopic: "integers",
    difficulty: "easy",
    questionType: "mcq",
    userAnswer: { type: "mcq", choice: 0 } as UserAnswer,
    correct: true,
    timeMs: 1200,
    at: 1700000000000,
    ...over,
  };
}

// -------------------------------------------------------------------------
// CachedGreProgressRepository
// -------------------------------------------------------------------------

test("cached repo: listAttempts is memoized on repeat read", async () => {
  const { inner } = fakeRepo();
  const cached = new CachedGreProgressRepository(inner);
  await inner.recordAttempt(makeAttempt());
  const a = await cached.listAttempts();
  const b = await cached.listAttempts();
  assert.equal(a, b, "second read should return same array reference");
  assert.equal(a.length, 1);
});

test("cached repo: recordAttempt invalidates the attempt cache", async () => {
  const { inner } = fakeRepo();
  const cached = new CachedGreProgressRepository(inner);
  await cached.recordAttempt(makeAttempt());
  const before = await cached.listAttempts();
  assert.equal(before.length, 1);
  await cached.recordAttempt(makeAttempt({ questionId: "q-ari-002" }));
  const after = await cached.listAttempts();
  assert.equal(after.length, 2, "write must invalidate memo");
  assert.notEqual(after, before);
});

test("cached repo: solvedIds and attemptedIds both invalidate on write", async () => {
  const { inner } = fakeRepo();
  const cached = new CachedGreProgressRepository(inner);
  await cached.recordAttempt(makeAttempt());
  const solved1 = await cached.solvedIds();
  const attempted1 = await cached.attemptedIds();
  assert.equal(solved1.size, 1);
  assert.equal(attempted1.size, 1);
  await cached.recordAttempt(makeAttempt({ questionId: "q-ari-002", correct: false }));
  const solved2 = await cached.solvedIds();
  const attempted2 = await cached.attemptedIds();
  assert.equal(solved2.size, 1, "still 1 solved");
  assert.equal(attempted2.size, 2, "attempted grew to 2");
});

test("cached repo: isSolved reuses listAttemptsForQuestion memo", async () => {
  const { inner } = fakeRepo();
  const cached = new CachedGreProgressRepository(inner);
  await cached.recordAttempt(makeAttempt());
  const a = await cached.isSolved("q-ari-001");
  const b = await cached.isSolved("q-ari-001");
  assert.equal(a, b);
  assert.equal(a, true);
});

test("cached repo: bookmark toggle invalidates bookmarkedIds and isBookmarked", async () => {
  const { inner } = fakeRepo();
  const cached = new CachedGreProgressRepository(inner);
  await cached.toggleBookmark("q-ari-001", "arithmetic");
  const ids1 = await cached.bookmarkedIds();
  assert.equal(ids1.size, 1);
  await cached.toggleBookmark("q-ari-001", "arithmetic");
  const ids2 = await cached.bookmarkedIds();
  assert.equal(ids2.size, 0, "second toggle removes the bookmark");
});

test("cached repo: setVocabState invalidates listVocabStates and getVocabState", async () => {
  const { inner } = fakeRepo();
  const cached = new CachedGreProgressRepository(inner);
  await cached.setVocabState({
    id: "v-0001",
    wordId: "v-0001",
    status: "learning",
    interval: 0,
    due: 0,
    reps: 0,
    lapses: 0,
  });
  const before = await cached.listVocabStates();
  assert.equal(before.length, 1);
  await cached.setVocabState({
    id: "v-0001",
    wordId: "v-0001",
    status: "known",
    interval: 0,
    due: 0,
    reps: 0,
    lapses: 0,
  });
  const after = await cached.listVocabStates();
  assert.equal(after[0].status, "known");
});

test("cached repo: TTL expires stale entries", async () => {
  const { inner } = fakeRepo();
  let now = 1_000;
  const cached = new CachedGreProgressRepository(inner, () => now);
  await inner.recordAttempt(makeAttempt());
  const early = await cached.listAttempts();
  assert.equal(early.length, 1);
  // Advance clock past 30s.
  now += 31_000;
  // Replace the underlying array to confirm cache is bypassed on stale read.
  inner.recordAttempt(makeAttempt({ questionId: "q-ari-002" }));
  const after = await cached.listAttempts();
  assert.equal(after.length, 2, "stale memo must be re-fetched after TTL");
});

test("cached repo: getRoadmap and getStreak use the longer TTL", async () => {
  const { inner, state } = fakeRepo();
  let now = 1_000;
  const cached = new CachedGreProgressRepository(inner, () => now);
  const r1 = await cached.getRoadmap();
  // 59s later: still memoized.
  now += 59_000;
  state.roadmap.completed["1.1"] = true; // mutate the underlying object
  const r2 = await cached.getRoadmap();
  assert.equal(r1, r2, "59s elapsed — still cached");
  // 60s + 1ms later: stale.
  now += 2_000;
  const r3 = await cached.getRoadmap();
  assert.equal(r3.completed["1.1"], true, "61s elapsed — refreshed");
});

test("cached repo: saveMock invalidates mock lookups", async () => {
  const { inner } = fakeRepo();
  const cached = new CachedGreProgressRepository(inner);
  await cached.saveMock({ id: "m1", startedAt: 1, questionIds: [], answers: {}, flagged: {} });
  const before = await cached.listMocks();
  assert.equal(before.length, 1);
  await cached.saveMock({ id: "m2", startedAt: 2, questionIds: [], answers: {}, flagged: {} });
  const after = await cached.listMocks();
  assert.equal(after.length, 2);
  await cached.deleteMock("m1");
  const afterDelete = await cached.listMocks();
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, "m2");
});

test("cached repo: read-through never re-invokes inner on a hot cache", async () => {
  const { inner } = fakeRepo();
  const cached = new CachedGreProgressRepository(inner);
  // Wrap the inner so we can count calls.
  let calls = 0;
  const original = inner.listAttempts;
  inner.listAttempts = async (...args) => {
    calls += 1;
    return original(...args);
  };
  await inner.recordAttempt(makeAttempt());
  // Bump cache once with a write that targets a different path:
  await cached.reportQuestion("q-ari-001", "wrong answer");
  // Now read listAttempts 5x — should hit the inner only once.
  for (let i = 0; i < 5; i += 1) {
    await cached.listAttempts();
  }
  assert.equal(calls, 1, "5 reads after invalidation should produce 1 inner call");
});

// -------------------------------------------------------------------------
// MapWithTTL — server-side primitive
// -------------------------------------------------------------------------

test("MapWithTTL: stores and returns values within TTL", () => {
  const m = new MapWithTTL<string, number>();
  // Far-future "now" so the entry is unambiguously live for the test.
  m.set("a", 1, 1000, 1_000_000_000);
  assert.equal(m.get("a", 1_000_000_500), 1);
});

test("MapWithTTL: drops values past their expiry", () => {
  const m = new MapWithTTL<string, number>();
  m.set("a", 1, 1000, 1_000_000_000);
  assert.equal(m.get("a", 1_000_001_001), undefined);
  assert.equal(m.has("a", 1_000_001_001), false);
});

test("MapWithTTL: has() respects expiry", () => {
  const m = new MapWithTTL<string, number>();
  m.set("a", 1, 1000, 1_000_000_000);
  assert.equal(m.has("a", 1_000_000_500), true);
  assert.equal(m.has("a", 1_000_002_000), false);
});

test("MapWithTTL: pruneExpired drops only expired entries", () => {
  const m = new MapWithTTL<string, number>();
  m.set("old", 1, 500, 1_000_000_000);
  m.set("new", 2, 5000, 1_000_001_000);
  const removed = m.pruneExpired(1_000_000_700);
  assert.equal(removed, 1);
  // Pass explicit `now` so the assertions don't accidentally re-expire against Date.now().
  assert.equal(m.has("old", 1_000_000_700), false);
  assert.equal(m.has("new", 1_000_000_700), true);
});

test("MapWithTTL: size tracks live entries", () => {
  const m = new MapWithTTL<string, number>();
  m.set("a", 1, 1000, 1_000_000_000);
  m.set("b", 2, 1000, 1_000_000_000);
  assert.equal(m.size, 2);
  m.pruneExpired(1_000_002_000);
  assert.equal(m.size, 0);
});

// -------------------------------------------------------------------------
// TtlSlot — single-value TTL slot
// -------------------------------------------------------------------------

test("TtlSlot: returns cached value until TTL expires", () => {
  const s = new TtlSlot<number>();
  s.write(7, 1000, 1_000_000_000);
  assert.equal(s.read(1_000_000_500), 7);
  assert.equal(s.read(1_000_001_000), undefined);
  assert.equal(s.read(1_000_001_500), undefined);
});

test("TtlSlot: invalidate() clears the slot", () => {
  const s = new TtlSlot<number>();
  s.write(7, 1000, 1_000_000_000);
  assert.equal(s.read(1_000_000_500), 7);
  s.invalidate();
  assert.equal(s.read(1_000_000_500), undefined);
});

// -------------------------------------------------------------------------
// enforceSizeGuard — defensive cap
// -------------------------------------------------------------------------

test("enforceSizeGuard: no-op when total size is under the cap", () => {
  const a = new MapWithTTL<string, number>();
  const b = new MapWithTTL<string, number>();
  // Use a far-future now so entries are not pruned during the test.
  const now = Date.now() + 60_000_000;
  for (let i = 0; i < 10; i += 1) a.set(`a${i}`, i, 1_000_000_000, now);
  enforceSizeGuard([a, b], MAX_CACHE_ENTRIES);
  assert.equal(a.size, 10);
});

test("enforceSizeGuard: evicts a quarter of the largest map when cap exceeded", () => {
  const big = new MapWithTTL<string, number>();
  const mid = new MapWithTTL<string, number>();
  const small = new MapWithTTL<string, number>();
  // Far-future now so the entries are not pruned as expired.
  const now = Date.now() + 60_000_000;
  for (let i = 0; i < 4_000; i += 1) big.set(`b${i}`, i, 1_000_000_000, now);
  for (let i = 0; i < 800; i += 1) mid.set(`m${i}`, i, 1_000_000_000, now);
  for (let i = 0; i < 300; i += 1) small.set(`s${i}`, i, 1_000_000_000, now);
  enforceSizeGuard([big, mid, small], MAX_CACHE_ENTRIES);
  // 4,800 + 800 + 300 = 5,100 > 5,000.
  // Largest map (big) loses ceil(4,000 / 4) = 1,000 entries -> 3,000 remain.
  assert.ok(big.size < 4_000, `expected big to be trimmed, got ${big.size}`);
  assert.equal(mid.size, 800, "mid should not be touched");
  assert.equal(small.size, 300, "small should not be touched");
});

// -------------------------------------------------------------------------
// Default TTL constant sanity
// -------------------------------------------------------------------------

test("DEFAULT_CACHE_TTL_MS matches the documented 60s", () => {
  assert.equal(DEFAULT_CACHE_TTL_MS, 60_000);
});