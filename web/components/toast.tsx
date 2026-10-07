'use client';

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="status"
      className="app-toast glass-surface pointer-events-none fixed rounded-full px-4 py-3 text-sm text-slate-100"
    >
      {message}
    </div>
  );
}
