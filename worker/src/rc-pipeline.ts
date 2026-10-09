// Helper functions extracted from /api/gre/generate-passage so they can be
// unit-tested without pulling in the whole worker fetch pipeline. The
// pipeline is: generate → programmatic checks → verify → cross-check →
// retry-on-failure → tag-and-return. This file owns steps 2-4 and the
// retry bookkeeping (step 5 stays in index.ts).

export const RC_Q_TYPES = new Set([
  "main-idea",
  "detail",
  "inference",
  "author-attitude",
  "function",
  "structure",
  "vocab-in-context",
  "strengthen-weaken",
]);

export type RcQTypeStr =
  | "main-idea"
  | "detail"
  | "inference"
  | "author-attitude"
  | "function"
  | "structure"
  | "vocab-in-context"
  | "strengthen-weaken";

export type CleanQuestion = {
  questionId: string;
  stem: string;
  kind: "single" | "multi" | "select-sentence";
  qType: RcQTypeStr;
  evidence: Array<{ sentence: number; anchor: string }>;
  rationale: string;
  choices?: string[];
  answer?: number | number[];
};

export type CleanPassage = {
  id: string;
  category: string;
  title: string;
  body: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  questions: CleanQuestion[];
};

/** Tiny sentence splitter used only inside the worker. The authoritative
 *  splitter lives in `web/lib/rc/splitter.ts`; the worker's purpose here
 *  is to produce indices for evidence checking. */
export function splitSentencesLocal(body: string): string[] {
  if (!body) return [];
  const out: string[] = [];
  const re = /([^.!?]+[.!?]+)(?=\s+[A-Z"']|$|\s*\n)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const start = m.index;
    if (start > last) out.push(body.slice(last, start).trim());
    out.push(m[0].trim());
    last = start + m[0].length;
  }
  if (last < body.length) {
    const tail = body.slice(last).trim();
    if (tail) out.push(tail);
  }
  return out.filter((s) => s.length > 0);
}

export function extractBodyText(passage: unknown): string {
  if (passage && typeof passage === "object" && "body" in passage) {
    const b = (passage as Record<string, unknown>).body;
    if (typeof b === "string") return b;
  }
  return "";
}

export function cleanPassageShape(
  raw: unknown,
  sentences: string[]
): CleanPassage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : `rc-ai-${hexId(obj)}`;
  const category = typeof obj.category === "string" ? obj.category : "";
  const title = typeof obj.title === "string" ? obj.title : "Practice passage";
  const body = typeof obj.body === "string" ? obj.body : "";
  const difficulty =
    obj.difficulty === "easy" || obj.difficulty === "hard"
      ? obj.difficulty
      : "medium";
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === "string")
    : [];
  if (!body || body.length < 200) return null;
  const wc = body.trim().split(/\s+/).length;
  if (wc < 150 || wc > 450) return null;
  const rawQuestions = Array.isArray(obj.questions) ? obj.questions : [];
  const out: CleanQuestion[] = [];
  for (const q of rawQuestions) {
    const cleaned = cleanQuestion(q, sentences);
    if (cleaned) out.push(cleaned);
  }
  if (out.length < 3) return null;
  return { id, category, title, body, difficulty, tags, questions: out };
}

export function cleanQuestion(
  raw: unknown,
  sentences: string[]
): CleanQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const questionId =
    typeof q.questionId === "string" && q.questionId.startsWith("q-")
      ? q.questionId
      : `q-rc-ai-${hexId(q)}`;
  const stem = typeof q.stem === "string" ? q.stem.trim() : "";
  if (stem.length < 10 || stem.length > 800) return null;
  const rationale = typeof q.rationale === "string" ? q.rationale.trim() : "";
  if (rationale.length < 20 || rationale.length > 800) return null;
  const qType = RC_Q_TYPES.has(String(q.qType))
    ? (q.qType as RcQTypeStr)
    : "detail";

  let kind: "single" | "multi" | "select-sentence";
  if (q.kind === "single" || q.kind === "multi" || q.kind === "select-sentence") {
    kind = q.kind;
  } else {
    return null;
  }

  const evidence = (Array.isArray(q.evidence) ? q.evidence : [])
    .map((ev) => {
      if (!ev || typeof ev !== "object") return null;
      const e = ev as Record<string, unknown>;
      const sentence = typeof e.sentence === "number" ? Math.floor(e.sentence) : -1;
      const anchor = typeof e.anchor === "string" ? e.anchor.trim() : "";
      if (
        sentence < 0 ||
        sentence >= sentences.length ||
        anchor.length < 3 ||
        anchor.length > 80
      ) {
        return null;
      }
      const actualHead = sentences[sentence].slice(0, anchor.length).toLowerCase();
      if (actualHead !== anchor.toLowerCase()) return null;
      return { sentence, anchor };
    })
    .filter((e): e is { sentence: number; anchor: string } => e !== null);

  if (evidence.length === 0) return null;

  const base = {
    questionId,
    stem,
    qType,
    evidence: evidence.slice(0, 4),
    rationale,
  };

  if (kind === "single") {
    const choices = Array.isArray(q.choices)
      ? q.choices.filter((c): c is string => typeof c === "string")
      : [];
    if (choices.length !== 5) return null;
    if (choices.some((c, i, arr) => arr.indexOf(c) !== i)) return null;
    const bodyLower = sentences.join(" ").toLowerCase();
    if (
      choices.some((c) => {
        const cl = c.trim().toLowerCase();
        return cl.length > 20 && bodyLower.includes(cl);
      })
    ) {
      return null;
    }
    const ans = typeof q.answer === "number" ? Math.floor(q.answer) : -1;
    if (ans < 0 || ans > 4) return null;
    return { ...base, kind, choices, answer: ans };
  }
  if (kind === "multi") {
    const choices = Array.isArray(q.choices)
      ? q.choices.filter((c): c is string => typeof c === "string")
      : [];
    if (choices.length !== 3) return null;
    if (choices.some((c, i, arr) => arr.indexOf(c) !== i)) return null;
    const ansRaw = Array.isArray(q.answer) ? q.answer : [];
    const ansSet = new Set<number>();
    for (const v of ansRaw) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 2) ansSet.add(v);
    }
    if (ansSet.size < 1 || ansSet.size > 3) return null;
    return { ...base, kind, choices, answer: [...ansSet].sort((a, b) => a - b) };
  }
  const ans = typeof q.answer === "number" ? Math.floor(q.answer) : -1;
  if (ans < 0 || ans >= sentences.length) return null;
  return { ...base, kind, answer: ans };
}

export function dropBadQuestions(
  cleaned: CleanPassage,
  sentences: string[]
): CleanPassage | null {
  const kept = cleaned.questions.filter((q) => {
    if (q.evidence.some((e) => e.sentence < 0 || e.sentence >= sentences.length)) {
      return false;
    }
    if (q.kind === "single" && typeof q.answer === "number" && q.answer < 0) return false;
    if (q.kind === "multi") {
      if (!Array.isArray(q.answer) || q.answer.length === 0) return false;
    }
    if (q.kind === "select-sentence" && typeof q.answer === "number" && q.answer < 0) return false;
    return true;
  });
  if (kept.length < 3) return null;
  return { ...cleaned, questions: kept };
}

export type CrossCheckResult =
  | { ok: true; ambiguous: boolean; passage: CleanPassage }
  | { ok: false; badCount: number };

export function crossCheckPassage(
  cleaned: CleanPassage,
  verifierRaw: unknown
): CrossCheckResult {
  if (!verifierRaw || typeof verifierRaw !== "object") {
    return { ok: false, badCount: cleaned.questions.length };
  }
  const v = verifierRaw as Record<string, unknown>;
  const answers = Array.isArray(v.answers) ? v.answers : [];
  const ambiguous = Array.isArray(v.ambiguous) ? v.ambiguous : [];
  let bad = 0;
  for (let i = 0; i < cleaned.questions.length; i++) {
    const q = cleaned.questions[i];
    if (!answersEqual(q, answers[i])) bad++;
  }
  if (bad > 0) return { ok: false, badCount: bad };
  const anyAmbiguous = ambiguous.some((a) => a === true);
  return { ok: true, ambiguous: anyAmbiguous, passage: cleaned };
}

function answersEqual(q: CleanQuestion, verifierAnswer: unknown): boolean {
  if (q.kind === "multi") {
    if (!Array.isArray(verifierAnswer)) return false;
    const a = [...(q.answer as number[])].sort();
    const b = [...verifierAnswer.map((v) => Number(v))].sort();
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  if (typeof verifierAnswer !== "number") return false;
  return Number(q.answer) === Number(verifierAnswer);
}

export function hexId(seed: unknown): string {
  const s = JSON.stringify(seed).slice(0, 64);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 8);
}
