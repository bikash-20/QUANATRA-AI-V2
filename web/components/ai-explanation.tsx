'use client';

import dynamic from 'next/dynamic';
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { getExplanation, type ExplanationInput } from '@/lib/explanations';

const MarkdownContent = dynamic(
  () => import('@/components/markdown-content').then((module) => module.MarkdownContent),
  { loading: () => <span aria-label="Rendering explanation">…</span> },
);

type Props = {
  input: ExplanationInput;
  label?: string;
  disabled?: boolean;
};

export function AIExplanation({
  input,
  label = 'AI explain',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const contentId = useId();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function loadExplanation(retry = false) {
    if (loading || (!retry && (text || error))) return;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const lang = window.localStorage.getItem('quantara.language') === 'bn' ? 'bn' : 'en';
      setText(await getExplanation({ ...input, lang }, requestController.signal));
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Could not load this explanation.');
    } finally {
      if (controller.current === requestController) {
        controller.current = null;
        setLoading(false);
      }
    }
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!text && !error) void loadExplanation();
  }

  return (
    <section className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        disabled={disabled}
        onClick={toggle}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-[var(--accent)] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
        {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : (
          <ChevronDown
            aria-hidden="true"
            size={16}
            className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
        )}
      </button>
      {open ? (
        <div id={contentId} className="answer-explanation rounded-r-xl text-sm">
          {loading ? (
            <div className="skeleton-surface h-16 rounded-lg" aria-label="Loading explanation" />
          ) : error ? (
            <div className="flex flex-wrap items-center gap-3">
              <span role="alert" className="inline-flex items-center gap-2">
                <AlertCircle aria-hidden="true" size={16} />
                {error}
              </span>
              <button type="button" className="underline underline-offset-2" onClick={() => void loadExplanation(true)}>
                Retry
              </button>
            </div>
          ) : text ? (
            <MarkdownContent content={text} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
