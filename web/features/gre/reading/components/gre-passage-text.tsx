// Sentence-indexed passage renderer.
//
// Renders the passage body as a sequence of <span> sentences, applying
// saved highlights, evidence-after-submit highlights, and the floating
// highlighter toolbar on selection. The highlighter + word popover
// wiring lives here; commit #9 finished wiring the full loop.
//
// Why span-per-sentence: the evidence is keyed by sentence index, the
// highlights are keyed by character offset, and a click on a word is
// keyed by a char-offset too. We snapshot the body once, derive
// sentence boundaries from the splitter, and keep all offset math in
// character space — the DOM is the projection, not the source of truth.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { splitSentencesWithOffsets } from "@/lib/rc/splitter";
import { getHighlights, saveHighlights, type HighlightColor, type RcHighlight } from "@/lib/rc/highlights";
import { GrePassageHighlightToolbar } from "./gre-passage-highlight-toolbar";
import { GreWordPopover } from "./gre-word-popover";
import { MarkdownContent } from "@/components/markdown-content";

type SentenceSpan = { text: string; start: number; end: number };

type Props = {
  passageId: string;
  body: string;
  /** Sentence array aligned with the validator/loader. */
  sentences: string[];
  /** Optional sentence indices to highlight (e.g. evidence after submit). */
  evidence?: number[];
};

export function GrePassageText({ passageId, body, sentences, evidence = [] }: Props) {
  const [highlights, setHighlights] = useState<RcHighlight[]>([]);
  const [toolbar, setToolbar] = useState<{ x: number; y: number; start: number; end: number } | null>(null);
  const [wordPopover, setWordPopover] = useState<{ x: number; y: number; word: string } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Recompute the sentence spans: prefer the precomputed `sentences` array
  // (aligned with the validator), but also keep char offsets so the
  // evidence-after-submit feature can find each sentence's slice.
  const spans = useMemo<SentenceSpan[]>(() => {
    if (sentences.length > 0) {
      let cursor = 0;
      return sentences.map((s) => {
        const idx = body.indexOf(s, cursor);
        if (idx === -1) {
          // Fall back to the splitter if the array drifted.
          const start = cursor;
          const end = Math.min(body.length, cursor + s.length);
          cursor = end;
          return { text: s, start, end };
        }
        const start = idx;
        const end = idx + s.length;
        cursor = end;
        return { text: s, start, end };
      });
    }
    return splitSentencesWithOffsets(body).map((o) => ({ text: o.text, start: o.start, end: o.end }));
  }, [body, sentences]);

  // Load saved highlights on mount / passage change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getHighlights(passageId);
      if (!cancelled) setHighlights(saved?.highlights ?? []);
    })();
    return () => { cancelled = true; };
  }, [passageId]);

  const persist = useCallback(
    async (next: RcHighlight[]) => {
      setHighlights(next);
      await saveHighlights(passageId, next, undefined, body.length);
    },
    [passageId, body.length]
  );

  // Map a DOM Range's selection back to character offsets in the body.
  const rangeToOffsets = useCallback((range: Range): { start: number; end: number } | null => {
    const root = containerRef.current;
    if (!root) return null;
    const body0 = body;
    // Walk the text nodes inside the container; count characters
    // backwards from each boundary until the body's start is reached.
    const walk = (node: Node, stopAt: Node): { offset: number; found: boolean } | null => {
      if (node === stopAt) return { offset: 0, found: true };
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node as Text;
        return { offset: t.data.length, found: false };
      }
      let total = 0;
      for (const child of Array.from(node.childNodes)) {
        const r = walk(child, stopAt);
        if (!r) return null;
        total += r.offset;
        if (r.found) return { offset: total, found: true };
      }
      return { offset: total, found: false };
    };
    const start = walk(root, range.startContainer);
    const end = walk(root, range.endContainer);
    if (!start || !end) return null;
    const startOff = start.offset + range.startOffset;
    const endOff = end.offset + range.endOffset;
    if (Number.isNaN(startOff) || Number.isNaN(endOff)) return null;
    const lo = Math.min(startOff, endOff);
    const hi = Math.max(startOff, endOff);
    if (hi - lo < 1) return null;
    if (lo < 0 || hi > body0.length) return null;
    return { start: lo, end: hi };
  }, [body]);

  // Selection → toolbar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setToolbar(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!containerRef.current || !containerRef.current.contains(range.commonAncestorContainer)) {
        setToolbar(null);
        return;
      }
      const offs = rangeToOffsets(range);
      if (!offs) {
        setToolbar(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setToolbar({ x: rect.left + rect.width / 2, y: rect.top - 8, start: offs.start, end: offs.end });
    };
    const onDown = () => setToolbar(null);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mousedown", onDown);
    };
  }, [rangeToOffsets]);

  // Double-click → word popover.
  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    const word = sel?.toString().trim();
    if (!word) return;
    setWordPopover({ x: e.clientX, y: e.clientY, word });
  }, []);

  const onPickColor = useCallback(
    (color: HighlightColor) => {
      if (!toolbar) return;
      const next: RcHighlight[] = [...highlights, { start: toolbar.start, end: toolbar.end, color }];
      void persist(next);
      setToolbar(null);
      window.getSelection()?.removeAllRanges();
    },
    [toolbar, highlights, persist]
  );

  const onClearAt = useCallback(() => {
    if (!toolbar) return;
    const next = highlights.filter((h) => !(h.start === toolbar.start && h.end === toolbar.end));
    void persist(next);
    setToolbar(null);
  }, [toolbar, highlights, persist]);

  return (
    <div
      ref={containerRef}
      onDoubleClick={onDoubleClick}
      className="whitespace-pre-line text-sm leading-relaxed text-slate-200"
    >
      {spans.map((sp, i) => {
        const isEvidence = evidence.includes(i);
        // Compute which highlight (if any) covers this sentence.
        const hl = highlights.find((h) => h.start <= sp.start && h.end >= sp.end);
        const className = [
          "rc-passage-sentence",
          hl ? `rc-passage-sentence--highlighted-${hl.color}` : "",
          isEvidence ? "rc-passage-sentence--evidence" : "",
        ].filter(Boolean).join(" ");
        return (
          <span key={i} className={className} data-sentence-index={i}>
            <MarkdownContent content={sp.text} inline />{" "}
          </span>
        );
      })}
      {toolbar ? (
        <GrePassageHighlightToolbar
          x={toolbar.x}
          y={toolbar.y}
          onPick={onPickColor}
          onClear={onClearAt}
        />
      ) : null}
      {wordPopover ? (
        <GreWordPopover
          x={wordPopover.x}
          y={wordPopover.y}
          word={wordPopover.word}
          onClose={() => setWordPopover(null)}
        />
      ) : null}
    </div>
  );
}