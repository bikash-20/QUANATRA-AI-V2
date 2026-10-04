import { Navbar } from '@/components/navbar';
import { GlassCard } from '@/components/glass-card';

export default function AdminPage() {
  return (
    <main className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-white sm:px-6 sm:pt-8 md:pb-12 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Navbar />
        <div className="mt-8">
          <GlassCard className="p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Admin</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Feature flags</h1>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {['Beta tutor mode', 'Question generator', 'Content moderation', 'Analytics'].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
