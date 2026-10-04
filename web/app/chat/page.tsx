'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, Loader2, StopCircle } from 'lucide-react';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/button';
import { ChatMessageBubble } from '@/components/chat-message';
import { streamChat, type ChatMessage } from '@/lib/api';
import { readStorage, STORAGE_KEYS, writeStorage } from '@/lib/storage';
import { Toast } from '@/components/toast';

const defaultMessages: ChatMessage[] = [
  { role: 'assistant', content: 'Hello! Ask me about algebra, data structures, or any concept you want to master.' },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [input, setInput] = useState('');
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [visibleMessageCount, setVisibleMessageCount] = useState(50);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = readStorage<ChatMessage[]>(STORAGE_KEYS.chats, defaultMessages);
      if (saved.length) setMessages(saved);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.chats, messages);
  }, [messages]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const botName = useMemo(() => (lang === 'bn' ? 'কথোপকথন' : 'Tutor'), [lang]);

  async function submitPrompt() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const nextUserMessage: ChatMessage = { role: 'user', content: trimmed };
    const outgoing = [...messages, nextUserMessage];
    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '' };
    setMessages([...outgoing, assistantPlaceholder]);
    setInput('');
    setLoading(true);

    try {
      await streamChat(
        { messages: outgoing, lang },
        (chunk) => {
          setMessages((current) => {
            const next = [...current];
            const lastIndex = next.length - 1;
            const last = next[lastIndex];
            if (last && last.role === 'assistant') {
              next[lastIndex] = { ...last, content: last.content + chunk };
            }
            return next;
          });
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Something went wrong');
      setMessages((current) => {
        const next = [...current];
        const lastIndex = next.length - 1;
        const last = next[lastIndex];
        if (last && last.role === 'assistant') {
          next[lastIndex] = {
            ...last,
            content: 'I hit a problem while generating the response. Please retry.',
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="chat-page relative min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-white sm:px-6 sm:pt-8 md:pb-12 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="chat-layout mx-auto mt-5 grid w-full max-w-[1600px] gap-4 sm:mt-8 sm:px-4 lg:px-8">
          <GlassCard className="flex h-[calc(100dvh-6.5rem)] min-h-[18rem] flex-col rounded-2xl p-3 sm:h-[calc(100dvh-4rem)] sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-300/65">{botName}</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">Ask Quantara</h1>
              </div>
              {loading ? (
                <Button variant="ghost" className="gap-2 text-red-200/80">
                  <StopCircle className="h-4 w-4" /> Stop
                </Button>
              ) : null}
            </div>

            <div
              aria-live="polite"
              className="glass-message-list min-h-0 flex-1 space-y-4 overflow-y-auto rounded-[24px] border p-3 sm:p-4"
            >
              {messages.length > visibleMessageCount ? (
                <Button
                  variant="ghost"
                  className="mx-auto flex"
                  onClick={() => setVisibleMessageCount((count) => count + 50)}
                >
                  Load earlier messages
                </Button>
              ) : null}
              {messages.slice(Math.max(0, messages.length - visibleMessageCount)).map((message, index, visibleMessages) => (
                <ChatMessageBubble
                  key={`${message.role}-${messages.length - visibleMessages.length + index}`}
                  message={message}
                  loading={loading}
                  isLast={messages.length - visibleMessages.length + index === messages.length - 1}
                />
              ))}
            </div>

            <div className="chat-composer sticky bottom-0 mt-3 flex gap-2 bg-transparent pt-1 sm:mt-4 sm:gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onFocus={() => {
                  document.body.dataset.chatInputFocused = 'true';
                }}
                onBlur={() => {
                  delete document.body.dataset.chatInputFocused;
                }}
                rows={2}
                placeholder="Ask a question or request a worked example..."
                aria-label="Ask Quantara a question"
                className="glass-input min-h-12 w-full resize-none rounded-[22px] px-4 py-3 text-sm placeholder:text-slate-300/60 focus:outline-none focus:ring-2 focus:ring-[#59c4df]/50"
              />
              <Button
                variant="primary"
                onClick={submitPrompt}
                disabled={loading || input.trim().length === 0}
                className="h-fit self-end rounded-[18px] px-4 py-3"
                aria-label={loading ? 'Generating response' : 'Send message'}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>
      <Toast message={toast} />
    </main>
  );
}
