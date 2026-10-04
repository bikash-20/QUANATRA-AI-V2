'use client';

import type { Difficulty } from '@/lib/api';

type Props = {
  value: Difficulty;
  onChange: (next: Difficulty) => void;
  label?: string;
  className?: string;
};

const levels: Array<{ id: Difficulty; label: string }> = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

export function DifficultyToggle({ value, onChange, label = 'Difficulty', className = '' }: Props) {
  return (
    <div className={`block ${className}`}>
      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">
        {label}
      </span>
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {levels.map((entry) => {
          const active = value === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(entry.id)}
              className={`flex-1 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] transition ${
                active
                  ? 'border border-[#8feaf0]/50 bg-[#8feaf0]/15 text-[#c9fbff]'
                  : 'border border-white/10 bg-white/5 text-slate-300/80 hover:bg-white/10'
              }`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}