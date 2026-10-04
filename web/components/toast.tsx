'use client';

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 rounded-full border border-white/15 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 shadow-[0_18px_36px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      {message}
    </div>
  );
}
