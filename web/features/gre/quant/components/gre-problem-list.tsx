"use client";
// GfG-style problem list. Server passes down the filtered list of question
// summaries; client hydrates status icons (unsolved / attempted / solved)
// and bookmark toggle from IDB.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { greProgress } from "@/features/gre/progress/repository";
import type { QuestionType } from "@/features/gre/content/loader.types";

export type ProblemRow = {
  id: string;
  type: QuestionType;
  difficulty: "easy" | "medium" | "hard";
  subtopic: string;
  title: string;
};

export function GreProblemList({
  topic,
  questions,
  page,
  pageSize,
  filters,
  subtopics,
}: {
  topic: string;
  questions: ProblemRow[];
  page: number;
  pageSize: number;
  filters: {
    difficulty: string;
    type: string;
    subtopic: string;
    status: string;
    bookmarked: string;
    q: string;
  };
  subtopics: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState<Set<string>>(new Set());
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sIds, aIds, bIds] = await Promise.all([
        greProgress.solvedIds(),
        greProgress.attemptedIds(),
        greProgress.bookmarkedIds(),
      ]);
      if (cancelled) return;
      setSolved(sIds);
      setAttempted(aIds);
      setBookmarked(bIds);
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    let v = questions;
    if (filters.status === "solved") v = v.filter((q) => solved.has(q.id));
    else if (filters.status === "attempted") v = v.filter((q) => attempted.has(q.id) && !solved.has(q.id));
    else if (filters.status === "unsolved") v = v.filter((q) => !attempted.has(q.id));
    if (filters.bookmarked === "1") v = v.filter((q) => bookmarked.has(q.id));
    return v;
  }, [questions, filters, solved, attempted, bookmarked]);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`/gre/quant/${topic}?${next.toString()}`);
  }

  async function toggleBookmark(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const isOn = await greProgress.toggleBookmark(id, topic);
    setBookmarked((prev) => {
      const next = new Set(prev);
      if (isOn) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageQuestions = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/15 bg-slate-900/40 p-3 text-xs">
        <Select label="Difficulty" value={filters.difficulty} options={[
          { v: "easy", l: "Easy" }, { v: "medium", l: "Medium" }, { v: "hard", l: "Hard" },
        ]} onChange={(v) => updateFilter("difficulty", v)} />
        <Select label="Type" value={filters.type} options={[
          { v: "mcq", l: "MCQ" }, { v: "multi", l: "Multi" }, { v: "qc", l: "QC" }, { v: "numeric", l: "Numeric" },
        ]} onChange={(v) => updateFilter("type", v)} />
        <Select label="Subtopic" value={filters.subtopic} options={subtopics.map((s) => ({ v: s, l: s }))} onChange={(v) => updateFilter("subtopic", v)} />
        <Select label="Status" value={filters.status} options={[
          { v: "unsolved", l: "Unsolved" }, { v: "attempted", l: "Attempted" }, { v: "solved", l: "Solved" },
        ]} onChange={(v) => updateFilter("status", v)} />
        <label className="ml-1 inline-flex items-center gap-1 text-slate-300">
          <input
            type="checkbox"
            checked={filters.bookmarked === "1"}
            onChange={(e) => updateFilter("bookmarked", e.target.checked ? "1" : "")}
          />
          Bookmarked
        </label>
        <input
          type="search"
          placeholder="Search…"
          defaultValue={filters.q}
          onChange={(e) => updateFilter("q", e.target.value)}
          className="ml-auto min-w-[8rem] rounded-md border border-slate-200/20 bg-slate-800/40 px-2 py-1 text-xs"
        />
      </div>

      <ul className="divide-y divide-slate-200/10 rounded-xl border border-slate-200/15 bg-slate-900/40">
        {visible.length === 0 ? (
          <li className="p-6 text-center text-sm text-slate-400">No questions match these filters.</li>
        ) : null}
        {pageQuestions.map((row) => {
          const isSolved = solved.has(row.id);
          const isAttempted = attempted.has(row.id);
          const isBookmarked = bookmarked.has(row.id);
          return (
            <li key={row.id} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                title={isSolved ? "Solved" : isAttempted ? "Attempted" : "Unsolved"}
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] ${
                  isSolved ? "bg-emerald-500/20 text-emerald-300"
                    : isAttempted ? "bg-amber-500/20 text-amber-300"
                    : "bg-slate-700/40 text-slate-400"
                }`}
              >
                {isSolved ? "✓" : isAttempted ? "•" : "·"}
              </span>
              <Link href={`/gre/quant/problem/${row.id}?topic=${topic}`} className="flex-1 truncate text-sm hover:text-cyan-200">
                {row.title}
              </Link>
              <span className={`rounded-full px-2 py-0.5 text-[0.65rem] uppercase ${
                row.difficulty === "easy" ? "bg-emerald-500/15 text-emerald-200"
                  : row.difficulty === "medium" ? "bg-amber-500/15 text-amber-200"
                  : "bg-rose-500/15 text-rose-200"
              }`}>
                {row.difficulty}
              </span>
              <span className="hidden md:inline-block rounded-md border border-slate-200/15 px-1.5 py-0.5 text-[0.65rem] uppercase text-slate-400">
                {row.type}
              </span>
              <span className="hidden md:inline-block text-xs text-slate-400">{row.subtopic}</span>
              <button
                type="button"
                onClick={(e) => toggleBookmark(row.id, e)}
                aria-pressed={isBookmarked}
                aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
                className={`rounded-md px-2 py-1 text-xs ${isBookmarked ? "bg-cyan-400/20 text-cyan-200" : "text-slate-400 hover:bg-slate-800/60"}`}
              >
                {isBookmarked ? "★" : "☆"}
              </button>
            </li>
          );
        })}
      </ul>

      {totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-3 text-sm">
          <PageBtn disabled={currentPage <= 1} href={pageHref(topic, sp, currentPage - 1)}>← Prev</PageBtn>
          <span className="text-slate-400">Page {currentPage} of {totalPages}</span>
          <PageBtn disabled={currentPage >= totalPages} href={pageHref(topic, sp, currentPage + 1)}>Next →</PageBtn>
        </nav>
      ) : null}
    </div>
  );
}

function pageHref(topic: string, sp: URLSearchParams, page: number) {
  const next = new URLSearchParams(sp.toString());
  next.set("page", String(page));
  return `/gre/quant/${topic}?${next.toString()}`;
}

function PageBtn({ disabled, href, children }: { disabled: boolean; href: string; children: React.ReactNode }) {
  if (disabled) return <span className="text-slate-600">{children}</span>;
  return <Link href={href} className="text-cyan-300 hover:underline">{children}</Link>;
}

function Select({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1 text-slate-300">
      <span className="text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-200/20 bg-slate-800/40 px-2 py-1 text-xs"
      >
        <option value="">All</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}