// Small qType badge shown only after submit. Maps the 8 RC question
// types to friendly labels and renders a slate pill.

import type { RcQType } from "@/features/gre/content/loader.types";

const LABELS: Record<RcQType, string> = {
  "main-idea": "Main idea",
  "detail": "Detail",
  "inference": "Inference",
  "author-attitude": "Author attitude",
  "function": "Function",
  "structure": "Structure",
  "vocab-in-context": "Vocab in context",
  "strengthen-weaken": "Strengthen / weaken",
};

export function GreQTypeBadge({ qType }: { qType: RcQType }) {
  const label = LABELS[qType] ?? qType;
  return (
    <span className="rounded-md border border-slate-200/15 px-1.5 py-0.5 text-xs uppercase tracking-wider text-slate-400">
      {label}
    </span>
  );
}