import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/button';

type ApiErrorNoticeProps = {
  message: string;
  onRetry: () => void;
};

export function ApiErrorNotice({ message, onRetry }: ApiErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="mt-4 flex flex-col gap-3 rounded-2xl border border-rose-300/25 bg-rose-950/35 p-4 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="inline-flex items-start gap-2">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        {message}
      </span>
      <Button variant="secondary" className="min-h-11 shrink-0" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
