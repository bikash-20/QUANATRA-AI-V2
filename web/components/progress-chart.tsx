'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const chartData = [
  { name: 'Mon', score: 62 },
  { name: 'Tue', score: 68 },
  { name: 'Wed', score: 74 },
  { name: 'Thu', score: 79 },
  { name: 'Fri', score: 86 },
  { name: 'Sat', score: 88 },
  { name: 'Sun', score: 91 },
];

export function ProgressChart() {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="fillColor" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#59c4df" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#59c4df" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="name" stroke="var(--chart-axis)" />
          <YAxis stroke="var(--chart-axis)" />
          <Tooltip />
          <Area type="monotone" dataKey="score" stroke="#59c4df" fill="url(#fillColor)" strokeWidth={3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
