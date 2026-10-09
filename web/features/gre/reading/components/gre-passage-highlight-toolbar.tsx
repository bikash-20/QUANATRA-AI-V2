// Floating glass toolbar that appears over the passage when the user
// has selected text. The full selection-tracking wiring (mouseup →
// char-offset capture → toolbar mount) lands in commit #9; for now we
// expose the toolbar UI so it can be rendered by gre-passage-text.tsx
// once that wiring is in place. Until then this component is unused.
//
// When the user picks a color, `onPick(color)` is called with the
// `start`/`end` character offsets already captured by the parent.

"use client";

import type { HighlightColor } from "@/lib/rc/highlights";

type Props = {
  /** x position relative to the viewport */
  x: number;
  y: number;
  onPick: (color: HighlightColor) => void;
  onClear?: () => void;
};

export function GrePassageHighlightToolbar({ x, y, onPick, onClear }: Props) {
  return (
    <div
      className="rc-highlight-toolbar fixed z-50 flex gap-1 rounded-xl border border-slate-200/20 bg-slate-900/85 px-2 py-1.5 text-xs shadow-lg backdrop-blur"
      style={{ left: x, top: y, transform: "translate(-50%, -100%)" }}
      role="toolbar"
      aria-label="Highlight selection"
      onMouseDown={(e) => e.preventDefault() /* keep selection */}
    >
      <button
        type="button"
        onClick={() => onPick("yellow")}
        className="rounded-md bg-yellow-300/80 px-2 py-1 font-medium text-slate-900 hover:bg-yellow-300"
        aria-label="Highlight yellow"
      >
        Yellow
      </button>
      <button
        type="button"
        onClick={() => onPick("green")}
        className="rounded-md bg-emerald-400/70 px-2 py-1 font-medium text-slate-900 hover:bg-emerald-400"
        aria-label="Highlight green"
      >
        Green
      </button>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-slate-200/30 px-2 py-1 text-slate-300 hover:bg-slate-800/60"
          aria-label="Clear highlight"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}