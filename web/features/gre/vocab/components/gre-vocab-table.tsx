"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { greProgress, type VocabStatus, type VocabState } from "@/features/gre/progress/repository";

export function GreVocabTable({
  setId,
  words,
  filters,
}: {
  setId: string;
  words: { id: string; word: string; pos: string; tier: number; definition: string }[];
  filters: { tier: string; status: string; q: string };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [states, setStates] = useState<Map<string, VocabState>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await greProgress.listVocabStates();
      if (cancelled) return;
      setStates(new Map(list.map((s) => [s.wordId, s])));
    })();
    return () => { cancelled = true; };
  }, []);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`/gre/vocab/${setId}?${next.toString()}`);
  }

  async function setStatus(id: string, status: VocabStatus) {
    const cur = states.get(id);
    const now = Date.now();
    const next: VocabState = cur
      ? { ...cur, status, lastReviewed: now }
      : { id, wordId: id, status, interval: 0, due: now, reps: 0, lapses: 0, lastReviewed: now };
    await greProgress.setVocabState(next);
    setStates((prev) => new Map(prev).set(id, next));
  }

  const visible = words.filter((w) => {
    const st = states.get(w.id)?.status ?? "new";
    if (filters.status && filters.status !== st) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/15 bg-slate-900/40 p-3 text-xs">
        <label className="inline-flex items-center gap-1 text-slate-300">
          <span className="text-slate-400">Tier</span>
          <select value={filters.tier} onChange={(e) => updateFilter("tier", e.target.value)} className="rounded-md border border-slate-200/20 bg-slate-800/40 px-2 py-1">
            <option value="">All</option>
            <option value="1">1 — Hard</option>
            <option value="2">2 — Harder</option>
            <option value="3">3 — Hardest</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-1 text-slate-300">
          <span className="text-slate-400">Status</span>
          <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)} className="rounded-md border border-slate-200/20 bg-slate-800/40 px-2 py-1">
            <option value="">All</option>
            <option value="new">New</option>
            <option value="learning">Learning</option>
            <option value="known">Known</option>
          </select>
        </label>
        <input
          type="search"
          placeholder="Search word or definition…"
          defaultValue={filters.q}
          onChange={(e) => updateFilter("q", e.target.value)}
          className="ml-auto min-w-[10rem] rounded-md border border-slate-200/20 bg-slate-800/40 px-2 py-1"
        />
        <Link href={`/gre/vocab/${setId}/quiz`} className="rounded-md bg-cyan-400/20 px-3 py-1 text-cyan-100 hover:bg-cyan-400/30">
          Take a quiz →
        </Link>
      </div>

      <ul className="divide-y divide-slate-200/10 rounded-xl border border-slate-200/15 bg-slate-900/40">
        {visible.map((w) => {
          const status = states.get(w.id)?.status ?? "new";
          return (
            <li key={w.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/gre/vocab/word/${w.id}`} className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{w.word}</span>
                  <span className="text-xs italic text-slate-400">{w.pos}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{w.definition}</p>
              </Link>
              <span className={`rounded-full px-2 py-0.5 text-[0.65rem] uppercase ${
                w.tier === 1 ? "bg-emerald-500/15 text-emerald-200"
                  : w.tier === 2 ? "bg-amber-500/15 text-amber-200"
                  : "bg-rose-500/15 text-rose-200"
              }`}>tier {w.tier}</span>
              <span className={`rounded-full px-2 py-0.5 text-[0.65rem] uppercase ${
                status === "known" ? "bg-emerald-500/15 text-emerald-200"
                  : status === "learning" ? "bg-amber-500/15 text-amber-200"
                  : "bg-slate-700/40 text-slate-300"
              }`}>{status}</span>
              <div className="flex gap-1">
                <StatusBtn current={status} target="new" onClick={() => setStatus(w.id, "new")}>New</StatusBtn>
                <StatusBtn current={status} target="learning" onClick={() => setStatus(w.id, "learning")}>Learn</StatusBtn>
                <StatusBtn current={status} target="known" onClick={() => setStatus(w.id, "known")}>Known</StatusBtn>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusBtn({ current, target, onClick, children }: {
  current: VocabStatus;
  target: VocabStatus;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === target;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2 py-1 text-xs ${active ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400 hover:bg-slate-800/60"}`}
    >
      {children}
    </button>
  );
}