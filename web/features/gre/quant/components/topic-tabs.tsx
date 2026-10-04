"use client";
// Tab control for the topic page. Pure client — uses next/navigation.

import Link from "next/link";

export function TopicTabs({ tab, topic }: { tab: "learn" | "problems"; topic: string }) {
  return (
    <div className="flex gap-1 rounded-xl border border-slate-200/15 bg-slate-900/40 p-1 self-start">
      <TabLink active={tab === "problems"} href={`/gre/quant/${topic}`} label="Problems" />
      <TabLink active={tab === "learn"} href={`/gre/quant/${topic}?tab=learn`} label="Learn" />
    </div>
  );
}

function TabLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-cyan-400/20 text-cyan-200"
          : "text-slate-300 hover:bg-slate-800/60 hover:text-cyan-100"
      }`}
    >
      {label}
    </Link>
  );
}