'use client';

import * as React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const baseClasses =
  'inline-flex items-center justify-center rounded-full text-sm font-medium transition ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9feef4]/60 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-[#9feef0]/40 bg-[linear-gradient(135deg,rgba(105,216,223,0.32),rgba(143,234,240,0.18))] ' +
    'px-5 py-2.5 text-white shadow-[0_10px_28px_rgba(105,216,223,0.22)] ' +
    'hover:border-[#bff7f7]/60 hover:shadow-[0_14px_34px_rgba(105,216,223,0.32)]',
  secondary:
    'border border-white/15 bg-white/5 px-5 py-2.5 text-slate-100 ' +
    'hover:border-white/30 hover:bg-white/10',
  ghost:
    'border border-transparent bg-transparent px-4 py-2 text-slate-200/80 ' +
    'hover:bg-white/5 hover:text-white',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...rest}
    />
  );
}
