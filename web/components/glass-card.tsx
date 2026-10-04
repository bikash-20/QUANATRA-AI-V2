import * as React from 'react';

export function GlassCard({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[28px] border border-white/12 bg-[linear-gradient(135deg,rgba(13,25,34,0.86),rgba(19,35,42,0.74),rgba(24,44,55,0.8))] shadow-[0_18px_40px_rgba(3,10,17,0.32)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}
