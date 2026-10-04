import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

test('GRE inline math renders as KaTeX rather than literal dollar delimiters', () => {
  const question = 'If $x^2 - 7x + 12 = 0$, find the sum of squares of the roots.';
  const html = renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] },
      question,
    ),
  );

  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /\$x\^2/);
});
