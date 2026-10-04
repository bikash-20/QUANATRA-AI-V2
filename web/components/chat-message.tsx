import dynamic from 'next/dynamic';
import { memo } from 'react';
import type { ChatMessage } from '@/lib/api';

const MarkdownContent = dynamic(
  () => import('@/components/markdown-content').then((module) => module.MarkdownContent),
  { loading: () => <span aria-label="Rendering response">…</span> },
);

type Props = {
  message: ChatMessage;
  loading: boolean;
  isLast: boolean;
};

export const ChatMessageBubble = memo(function ChatMessageBubble({ message, loading, isLast }: Props) {
  return (
    <div
      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
        message.role === 'user'
          ? 'ml-auto border border-[#59c4df]/20 bg-[linear-gradient(135deg,rgba(77,184,212,0.2),rgba(67,126,182,0.16))] text-white'
          : 'glass-message text-slate-100'
      }`}
    >
      {message.content ? (
        <MarkdownContent content={message.content} isStreaming={loading && isLast} />
      ) : loading && isLast ? (
        <span aria-label="Generating response">…</span>
      ) : null}
    </div>
  );
});
