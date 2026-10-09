"use client";
// Hydrates an AI-generated passage from sessionStorage and mounts the
// passage solver. The passage is produced by /api/reading/generate and
// stored under the key `gre-ai-passage:<id>` on the category page that
// generated it; opening the URL in a new tab will not have that storage
// entry, in which case we render a friendly notice with a link back.

import { useState } from "react";
import Link from "next/link";
import type { ReadingPassage } from "@/features/gre/content/loader.types";
import { GrePassageSolver } from "./gre-passage-solver";

export function GreAiPassageSolver({ passageId }: { passageId: string }) {
  // sessionStorage is browser-only; useState's lazy initializer runs only
  // on the client, so we read it there. If we're on the server (or the
  // entry is missing), fall back to null and render the notice below.
  const [passage] = useState<ReadingPassage | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(`gre-ai-passage:${passageId}`);
      if (!raw) return null;
      return JSON.parse(raw) as ReadingPassage;
    } catch {
      return null;
    }
  });

  if (!passage) {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-900/20 p-5 text-sm text-amber-100">
        <p className="font-semibold">This AI-generated passage is not available in this tab.</p>
        <p className="mt-1 text-amber-200/80">
          The Worker returns a fresh passage on every request, so re-opening this URL in a new tab
          can&apos;t restore the original. Go back to a category page and click
          <span className="mx-1 rounded bg-amber-300/20 px-1 py-0.5 text-amber-100">Generate practice passage</span>
          again to produce a new one.
        </p>
        <Link
          href="/gre/reading"
          className="mt-3 inline-block rounded-md bg-cyan-400/20 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/30"
        >
          Back to reading →
        </Link>
      </div>
    );
  }
  return <GrePassageSolver passage={passage} source="ai" />;
}
