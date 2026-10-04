import * as React from 'react';

type SurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

export function GlassCard({ className = '', children, ...props }: SurfaceProps) {
  return (
    <div className={`glass-surface rounded-3xl ${className}`} {...props}>
      {children}
    </div>
  );
}

type GlassButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function GlassButton({ className = '', type = 'button', ...props }: GlassButtonProps) {
  return <button type={type} className={`glass-button rounded-full ${className}`} {...props} />;
}

type GlassPillProps = React.HTMLAttributes<HTMLSpanElement>;

export function GlassPill({ className = '', ...props }: GlassPillProps) {
  return <span className={`glass-pill rounded-full px-3 py-1.5 ${className}`} {...props} />;
}

type GlassInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function GlassInput({ className = '', ...props }: GlassInputProps) {
  return <input className={`glass-input w-full rounded-2xl px-3 py-2.5 ${className}`} {...props} />;
}
