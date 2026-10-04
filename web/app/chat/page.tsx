'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, Loader2, Sparkles, StopCircle } from 'lucide-react';
import { Navbar } from '@/components/navbar';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/button';
import { streamChat, type ChatMessage } from '@/lib/api';
import { readStorage, STORAGE_KEYS, writeStorage } from '@/lib/storage';
import { Toast } from '@/components/toast';

const defaultMessages: ChatMessage[] = [
  { role: 'assistant', content: 'Hello! Ask me about algebra, data structures, or any concept you want to master.' },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [input, setInput] = useState('');
  const [subject, setSubject] = useState('CS');
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const saved = readStorage<ChatMessage[]>(STORAGE_KEYS.chats, defaultMessages);
    if (saved.length) {
      setMessages(saved);
    }
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
        { messages: outgoing, subject, lang },
        (chunk) => {
          setMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              last.content += chunk;
            }
            return next;
          });
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Something went wrong');
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          last.content = 'I hit a problem while generating the response. Please retry.';
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen px-4 pb-12 pt-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Navbar />

        <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
          <GlassCard className="p-4">
            <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-300/70">
              <Sparkles className="h-4 w-4 text-[#8feaf0]" /> Subject
            </div>
            <div className="flex flex-wrap gap-2">
              {['CS', 'Math', 'Physics', 'Code', 'English'].map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setSubject(entry)}
                  className={`rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] ${
                    subject === entry
                      ? 'border border-[#8feaf0]/50 bg-[#8feaf0]/15 text-[#c9fbff]'
                      : 'border border-white/10 bg-white/5 text-slate-300/80'
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between rounded-full border border-white/10 bg-white/4 p-1">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`flex-1 rounded-full px-3 py-2 text-sm ${lang === 'en' ? 'bg-white/10 text-white' : 'text-slate-300'}`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`flex-1 rounded-full px-3 py-2 text-sm ${lang === 'bn' ? 'bg-white/10 text-white' : 'text-slate-300'}`}
              >
                বাংলা
              </button>
            </div>
          </GlassCard>

          <GlassCard className="flex min-h-[700px] flex-col p-4 sm:p-5">
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

            <div className="flex-1 space-y-4 overflow-y-auto rounded-[24px] border border-white/10 bg-[rgba(5,15,19,0.5)] p-4">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'ml-auto bg-[linear-gradient(135deg,rgba(120,231,241,0.2),rgba(187,152,255,0.16))] text-white'
                      : 'bg-white/5 text-slate-100'
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm leading-7">{message.content || (loading && index === messages.length - 1 ? '...' : '')}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder="Ask a question or request a worked example..."
                className="w-full resize-none rounded-[22px] border border-white/12 bg-white/4 px-4 py-3 text-sm text-white placeholder:text-slate-300/60 focus:outline-none focus:ring-2 focus:ring-[#8feaf0]/40"
              />
              <Button
                variant="primary"
                onClick={submitPrompt}
                disabled={loading || input.trim().length === 0}
                className="h-fit self-end rounded-[18px] px-4 py-3"
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
