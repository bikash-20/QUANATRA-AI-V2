'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  language: string;
  source: string;
  theme: 'dark' | 'light';
};

type Highlighter = {
  codeToHtml: (
    source: string,
    options: { lang: string; themes: { light: string; dark: string }; defaultColor: false },
  ) => string;
};

const aliases: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  md: 'markdown',
  txt: 'text',
};

const highlighterPromises = new Map<string, Promise<Highlighter>>();

function getHighlighter(language: string): Promise<Highlighter> {
  const key = aliases[language.toLowerCase()] ?? language.toLowerCase();
  let pending = highlighterPromises.get(key);
  if (!pending) {
    pending = import('shiki').then(async ({ createHighlighter }) => {
      const highlighter = await createHighlighter({
        themes: ['dark-plus', 'light-plus'],
        langs: [key],
      });
      return highlighter as unknown as Highlighter;
    });
    highlighterPromises.set(key, pending);
  }
  return pending;
}

export function HighlightedCode({ language, source, theme }: Props) {
  const [highlighted, setHighlighted] = useState<{ key: string; html: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const key = `${language}\u0000${source}`;
  const html = highlighted?.key === key ? highlighted.html : '';
  const failed = failedFor === key;

  useEffect(() => {
    let active = true;
    void getHighlighter(language)
      .then((highlighter) =>
        highlighter.codeToHtml(source, {
          lang: aliases[language.toLowerCase()] ?? language.toLowerCase(),
          themes: { light: 'light-plus', dark: 'dark-plus' },
          defaultColor: false,
        }),
      )
      .then((result) => {
        if (active) setHighlighted({ key, html: result });
      })
      .catch(() => {
        if (active) setFailedFor(key);
      });
    return () => {
      active = false;
    };
  }, [key, language, source]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setFailedFor(key);
    }
  }

  return (
    <div className={`code-block code-theme-${theme}`}>
      <div className="code-block-header">
        <span>{language}</span>
        <button type="button" onClick={() => void copyCode()} aria-label="Copy code">
          {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {html && !failed ? (
        <div className="code-block-scroll" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="code-block-scroll"><code>{source}</code></pre>
      )}
    </div>
  );
}
