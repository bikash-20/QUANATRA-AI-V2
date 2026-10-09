"use client";
// AI-fill panel: hit /api/gre/generate-passage and render the returned
// passage inline. The new endpoint runs a cross-checked pipeline
// (generate → verify → programmatic checks → retry on disagreement),
// so every passage the user gets has at minimum a generator-only
// sanity check, and usually a blind verifier pass too. The response
// envelope is the same RcPassage shape used everywhere else.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RcPassage } from "@/features/gre/content/loader.types";
import { apiRequest } from "@/lib/api";
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
  // AI-pipeline metadata (commit #14). Optional because hand-authored
  // passages never set them. Stored alongside the passage so the
  // sessionStorage copy can show the source + verification badge.
  generatorModel: z.string().optional(),
  verifierModel: z.string().nullable().optional(),
  verification: z.enum(["cross-checked", "weak", "single-model"]).optional(),
  createdAt: z.number().optional(),
});
type GeneratedPassage = z.infer<typeof PassageSchema>;

export function GreAiFillPanel({ category }: { category: RcPassage["category"] }) {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPassage, setLastPassage] = useState<GeneratedPassage | null>(null);
  const router = useRouter();

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const passage = await apiRequest(
        "/api/gre/generate-passage",
        { category, topic: topic.trim() || category, difficulty, lang: window.localStorage.getItem("quantara.language") === "bn" ? "bn" : "en" },
        PassageSchema,
      );
      setLastPassage(passage);
      // store in sessionStorage so the practice page can pick it up
      try {
        window.sessionStorage.setItem(`gre-ai-passage:${passage.id}`, JSON.stringify(passage));
      } catch {
        /* quota — fall through; user can re-generate */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate passage");
    } finally {
      setLoading(false);
    }
  }

  return (
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
        <div className="mt-3 rounded-xl border border-slate-200/15 bg-slate-900/40 p-3 text-sm">
          <p className="text-xs text-slate-500">Generated just now</p>
          <p className="mt-1 text-base font-semibold text-cyan-100">{lastPassage.title}</p>
          <p className="text-xs text-slate-400">{lastPassage.questions.length} questions · {lastPassage.difficulty}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/gre/reading/ai/${encodeURIComponent(lastPassage.id)}`)}
              className="rounded-md bg-cyan-400/20 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-400/30"
            >
              Practice now →
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              className="rounded-md border border-slate-200/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60"
            >
              Generate another
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
