import { notFound } from 'next/navigation';
import { AdminDashboard } from '@/components/admin-dashboard';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <AdminDashboard />;
}
