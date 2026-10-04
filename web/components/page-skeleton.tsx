export function PageSkeleton() {
  return (
    <main
      aria-label="Loading page"
      className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-8 md:pb-12 lg:px-10"
    >
      <div className="mx-auto max-w-6xl">
        <div className="skeleton-surface h-14 rounded-full" />
        <div className="mt-8 grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="skeleton-surface min-h-64 rounded-3xl" />
          <div className="skeleton-surface min-h-[28rem] rounded-3xl" />
        </div>
      </div>
    </main>
  );
}
