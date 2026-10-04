'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { HighlightedCode } from '@/components/highlighted-code';
import { stabilizeStreamingMarkdown } from '@/lib/streaming-markdown';

type KatexPlugin = typeof import('rehype-katex').default;

type Props = {
  content: string;
  isStreaming?: boolean;
};

export function MarkdownContent({ content, isStreaming = false }: Props) {
  const { resolvedTheme } = useTheme();
  const [katexPlugin, setKatexPlugin] = useState<KatexPlugin | null>(null);
  const stableMarkdown = stabilizeStreamingMarkdown(content);
  const hasCompleteMath =
    !isStreaming &&
    (/\\\[[\s\S]+?\\\]/.test(content) ||
      /\\\([\s\S]+?\\\)/.test(content) ||
      /\$\$[\s\S]+?\$\$/.test(content) ||
      /(?<!\\)\$[^$\n]+?\$/.test(content));

  useEffect(() => {
    let active = true;
    if (!hasCompleteMath || katexPlugin) return;
    void Promise.all([
      import('rehype-katex').then((module) => module.default),
      import('katex/dist/katex.min.css'),
    ]).then(([plugin]) => {
      if (active) setKatexPlugin(() => plugin);
    });
    return () => {
      active = false;
    };
  }, [hasCompleteMath, katexPlugin]);

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={hasCompleteMath && katexPlugin ? [katexPlugin] : []}
        components={{
          table: ({ children }) => (
            <div className="markdown-table-scroll">
              <table>{children}</table>
            </div>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const source = String(children).replace(/\n$/, '');
            const language = /language-([\w+-]+)/.exec(className ?? '')?.[1];
            if (!language) return <code>{children}</code>;
            if (isStreaming && !content.trimEnd().endsWith('```')) {
              return <pre className="streaming-code"><code>{source}</code></pre>;
            }
            return (
              <HighlightedCode
                key={`${language}:${source.length}`}
                language={language}
                source={source}
                theme={resolvedTheme === 'light' ? 'light' : 'dark'}
              />
            );
          },
        }}
      >
        {stableMarkdown}
      </ReactMarkdown>
    </div>
  );
}
