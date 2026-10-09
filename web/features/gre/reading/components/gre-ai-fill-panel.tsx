"use client";
// AI-fill panel: hit /api/gre/generate-passage and persist the result to
// IDB via lib/rc/generated.ts so the user can re-open it from a fresh
// tab. Also lists previously generated passages for the same category
// with a Practice / Delete button on each row.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RcPassage } from "@/features/gre/content/loader.types";
import { apiRequest } from "@/lib/api";
import {
  type GeneratedPassageRecord,
  type GeneratedVerification,
  deleteGenerated,
  listGenerated,
  saveGenerated,
} from "@/lib/rc/generated";
import { splitSentences } from "@/lib/rc/splitter";
import { z } from "zod";

const PassageSchema = z.object({
  id: z.string(),
  category: z.enum(["business", "science", "social-science", "arts"]),
  title: z.string(),
  source: z.enum(["original", "ai", "external"]),
  body: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string()),
  sentences: z.array(z.string()).optional(),
  questions: z.array(
    z.union([
      z.object({ kind: z.literal("single"), questionId: z.string(), stem: z.string(), qType: z.enum(["main-idea", "detail", "inference", "author-attitude", "function", "structure", "vocab-in-context", "strengthen-weaken"]), evidence: z.array(z.object({ sentence: z.number(), anchor: z.string() })), choices: z.array(z.string()).length(5), answer: z.number().int().min(0).max(4), rationale: z.string() }),
      z.object({ kind: z.literal("multi"), questionId: z.string(), stem: z.string(), qType: z.enum(["main-idea", "detail", "inference", "author-attitude", "function", "structure", "vocab-in-context", "strengthen-weaken"]), evidence: z.array(z.object({ sentence: z.number(), anchor: z.string() })), choices: z.array(z.string()).length(3), answer: z.array(z.number().int().min(0).max(2)).min(1).max(3), rationale: z.string() }),
      z.object({ kind: z.literal("select-sentence"), questionId: z.string(), stem: z.string(), qType: z.enum(["main-idea", "detail", "inference", "author-attitude", "function", "structure", "vocab-in-context", "strengthen-weaken"]), evidence: z.array(z.object({ sentence: z.number(), anchor: z.string() })), answer: z.number().int().min(0), rationale: z.string() }),
    ])
  ).min(3).max(5),
  generatorModel: z.string().optional(),
  verifierModel: z.string().nullable().optional(),
  verification: z.enum(["cross-checked", "weak", "single-model"]).optional(),
  createdAt: z.number().optional(),
});
type GeneratedPassage = z.infer<typeof PassageSchema>;

const VERIFICATION_BADGES: Record<GeneratedVerification, { label: string; cls: string }> = {
  "cross-checked": {
    label: "cross-checked",
    cls: "bg-emerald-500/15 text-emerald-200",
  },
  weak: {
    label: "weak verification",
    cls: "bg-amber-500/15 text-amber-200",
  },
  "single-model": {
    label: "single-model",
    cls: "bg-slate-500/15 text-slate-300",
  },
};

export function GreAiFillPanel({ category }: { category: RcPassage["category"] }) {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPassage, setLastPassage] = useState<GeneratedPassage | null>(null);
  const [generatedList, setGeneratedList] = useState<GeneratedPassageRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const items = await listGenerated(category);
      if (cancelled) return;
      setGeneratedList(items);
    })();
    return () => {
      cancelled = true;
    };
  }, [category, lastPassage]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const raw = await apiRequest(
        "/api/gre/generate-passage",
        { category, topic: topic.trim() || category, difficulty, lang: window.localStorage.getItem("quantara.language") === "bn" ? "bn" : "en" },
        PassageSchema,
      );
      // Resolve createdAt here (event handler) so render doesn't have to
      // call Date.now(). The worker always sets it but the schema
      // permits it to be absent; we fall back to "now" once at receive.
      const createdAt = raw.createdAt ?? Date.now();
      const passage: GeneratedPassage = { ...raw, createdAt };
      setLastPassage(passage);
      // Save to sessionStorage so the practice page can pick it up (also
      // legacy behaviour kept for cross-tab use).
      try {
        window.sessionStorage.setItem(`gre-ai-passage:${passage.id}`, JSON.stringify(passage));
      } catch {
        /* quota — fall through; user can re-generate */
      }
      // Also persist to IDB. The frozen `sentences` slice comes from
      // the worker envelope when present; otherwise we re-split with
      // the canonical client splitter. This keeps future versions of
      // the client from drifting on a passage that was authored under
      // an older splitter.
      const sentences =
        Array.isArray(passage.sentences) && passage.sentences.length > 0
          ? passage.sentences
          : splitSentences(passage.body);
      const record: GeneratedPassageRecord = {
        id: passage.id,
        passage,
        sentences,
        generatorModel: passage.generatorModel ?? "unknown",
        verifierModel: passage.verifierModel ?? null,
        verification: passage.verification ?? "single-model",
        createdAt,
        category,
        topic: topic.trim() || undefined,
      };
      await saveGenerated(record);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate passage");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteGenerated(id);
    setGeneratedList((current) => current.filter((g) => g.id !== id));
    if (lastPassage?.id === id) setLastPassage(null);
    try {
      window.sessionStorage.removeItem(`gre-ai-passage:${id}`);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={`Topic (e.g. "venture capital", "climate adaptation")`}
            className="flex-1 min-w-[12rem] rounded-md border border-slate-200/20 bg-slate-800/40 px-3 py-2 text-sm"
          />
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard")}
            className="rounded-md border border-slate-200/20 bg-slate-800/40 px-2 py-2 text-sm"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30 disabled:opacity-60"
          >
            {loading ? "Generating…" : "Generate practice passage"}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        {lastPassage ? (
          <GeneratedRow
            record={{
              id: lastPassage.id,
              passage: lastPassage,
              sentences: lastPassage.sentences ?? [],
              generatorModel: lastPassage.generatorModel ?? "unknown",
              verifierModel: lastPassage.verifierModel ?? null,
              verification: lastPassage.verification ?? "single-model",
              createdAt: lastPassage.createdAt ?? 0,
              category,
              topic: topic.trim() || undefined,
            }}
            badge="just now"
            onDelete={() => void handleDelete(lastPassage.id)}
          />
        ) : null}
      </div>

      {generatedList.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-cyan-100">My generated passages</h3>
          <p className="mt-1 text-xs text-slate-500">
            Saved on this device. Practice them again or delete to clear storage.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {generatedList.map((g) => (
              <GeneratedRow
                key={g.id}
                record={g}
                badge={formatRelative(g.createdAt)}
                onDelete={() => void handleDelete(g.id)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function GeneratedRow({
  record,
  badge,
  onDelete,
}: {
  record: GeneratedPassageRecord;
  badge: string;
  onDelete: () => void;
}) {
  const router = useRouter();
  const passage = record.passage as GeneratedPassage;
  const verb = VERIFICATION_BADGES[record.verification] ?? VERIFICATION_BADGES["single-model"];
  return (
    <li className="mt-3 rounded-xl border border-slate-200/15 bg-slate-900/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-[0.65rem] uppercase tracking-wider ${verb.cls}`}>
          AI · {verb.label}
        </span>
        <span className="text-xs text-slate-500">{badge}</span>
      </div>
      <p className="mt-1 text-base font-semibold text-cyan-100">{passage.title}</p>
      <p className="text-xs text-slate-400">
        {passage.questions.length} questions · {passage.difficulty}
        {record.topic ? ` · ${record.topic}` : ""}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            try {
              window.sessionStorage.setItem(`gre-ai-passage:${record.id}`, JSON.stringify(passage));
            } catch {
              /* ignore */
            }
            router.push(`/gre/reading/ai/${encodeURIComponent(record.id)}`);
          }}
          className="rounded-md bg-cyan-400/20 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-400/30"
        >
          Practice now →
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-slate-200/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-rose-500/15 hover:text-rose-200"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function formatRelative(ts: number): string {
  const diffS = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffS < 60) return `${diffS}s ago`;
  const m = Math.round(diffS / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
