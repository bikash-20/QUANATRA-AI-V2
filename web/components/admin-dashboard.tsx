'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, ShieldCheck, Shield, TriangleAlert } from 'lucide-react';
import { authAdapter, type UserRole } from '@/lib/auth';
import { adminCounts, adminService, type AdminOverview } from '@/lib/admin';

export function AdminDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (process.env.NODE_ENV !== 'development') {
        const session = await authAdapter.getSession();
        if (process.env.NEXT_PUBLIC_AUTH_ENABLED !== 'true' || session?.role !== 'admin') {
          if (active) {
            setAccess('denied');
            router.replace(session ? '/' : '/login');
          }
          return;
        }
      }
      if (active) setAccess('allowed');
      try {
        const data = await adminService.getOverview();
        if (active) setOverview(data);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load admin data.');
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function changeRole(userId: string, role: UserRole) {
    if (!overview) return;
    try {
      const users = await adminService.setUserRole(userId, role);
      setOverview({ ...overview, users, counts: { ...overview.counts, admins: users.filter((user) => user.role === 'admin').length } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this role.');
    }
  }

  if (access !== 'allowed') {
    return (
      <main className="admin-loading" aria-label="Checking administrator access">
        <Loader2 aria-hidden="true" className="animate-spin" />
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Workspace</p>
          <h1>Administration</h1>
          <p className="admin-subtitle">Usage overview and system health.</p>
        </div>
        <button type="button" className="admin-refresh" onClick={() => window.location.reload()}>
          <RefreshCw aria-hidden="true" size={16} /> Refresh
        </button>
      </header>

      {error ? <p role="alert" className="admin-error">{error}</p> : null}

      {overview ? (
        <>
          <section className="admin-counts" aria-label="Usage counts">
            {adminCounts.map(([key, label]) => (
              <article key={key} className="admin-count-card">
                <span>{label}</span>
                <strong>{overview.counts[key].toLocaleString()}</strong>
              </article>
            ))}
          </section>

          <div className="admin-section-grid">
            <section className="admin-section" aria-labelledby="admin-users">
              <h2 id="admin-users">Users</h2>
              <div className="admin-table-scroll">
                <table>
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead>
                  <tbody>
                    {overview.users.map((user) => (
                      <tr key={user.id}>
                        <td data-label="Name">{user.name}</td><td data-label="Email">{user.email}</td><td data-label="Role">{user.role}</td>
                        <td data-label="Action">
                          <button
                            type="button"
                            className="admin-action"
                            onClick={() => void changeRole(user.id, user.role === 'admin' ? 'user' : 'admin')}
                          >
                            {user.role === 'admin' ? <Shield aria-hidden="true" size={15} /> : <ShieldCheck aria-hidden="true" size={15} />}
                            {user.role === 'admin' ? 'Demote' : 'Promote'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="admin-section" aria-labelledby="admin-cache">
              <h2 id="admin-cache">AI cache</h2>
              <div className="admin-table-scroll">
                <table>
                  <thead><tr><th>Key</th><th>Kind</th><th>Bytes</th><th>Expires</th><th>Created</th></tr></thead>
                  <tbody>
                    {overview.cache.map((entry) => (
                      <tr key={entry.key}>
                        <td data-label="Key" className="admin-cache-key">{entry.key}</td><td data-label="Kind">{entry.kind}</td>
                        <td data-label="Bytes">{entry.bytes}</td><td data-label="Expires">{entry.expiresAt}</td><td data-label="Created">{entry.createdAt}</td>
                      </tr>
                    ))}
                    {!overview.cache.length ? <tr><td colSpan={5} data-label="Info">Cache entries are not exposed by the worker.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="admin-section admin-health" aria-labelledby="cascade-health">
            <div>
              <p className="admin-eyebrow">Backend</p>
              <h2 id="cascade-health">Cascade health</h2>
            </div>
            {overview.cascade.error ? (
              <p className="admin-health-warning"><TriangleAlert aria-hidden="true" size={17} /> {overview.cascade.error}</p>
            ) : (
              <div className="admin-health-details">
                <span>{overview.cascade.activeTiers.length} active tiers</span>
                <span>{overview.cascade.cacheSize} cached</span>
                <span>{overview.cascade.kvCache ? 'KV cache enabled' : 'Local cache only'}</span>
                <span>{overview.cascade.openRouterEnabled ? 'OpenRouter fallback on' : 'OpenRouter fallback off'}</span>
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
