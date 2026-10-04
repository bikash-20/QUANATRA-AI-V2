import { z } from 'zod';
import type { UserRole } from '@/lib/auth';

export const adminCounts = [
  ['users', 'Users'],
  ['admins', 'Admins'],
  ['quizzes', 'Quizzes'],
  ['attempts', 'Attempts'],
  ['finished', 'Finished'],
  ['quizItems', 'Quiz items'],
  ['mcqBank', 'MCQ bank'],
  ['aiCache', 'AI cache'],
  ['flashDecks', 'Flash decks'],
  ['flashCards', 'Flash cards'],
] as const;

export type AdminCountKey = (typeof adminCounts)[number][0];
export type AdminUser = { id: string; name: string; email: string; role: UserRole };
export type AdminCacheEntry = {
  key: string;
  kind: 'JSON' | 'TEXT' | 'EXPLANATION';
  bytes: number;
  expiresAt: string;
  createdAt: string;
};
export type CascadeHealth = {
  activeTiers: string[];
  cacheSize: number;
  kvCache: boolean;
  openRouterEnabled: boolean;
  error?: string;
};
export type AdminOverview = {
  counts: Record<AdminCountKey, number>;
  users: AdminUser[];
  cache: AdminCacheEntry[];
  cascade: CascadeHealth;
};

export interface AdminService {
  getOverview(): Promise<AdminOverview>;
  setUserRole(userId: string, role: UserRole): Promise<AdminUser[]>;
}

const healthSchema = z.object({
  cf: z.array(z.string()),
  openrouter: z.boolean(),
  openrouterModels: z.array(z.string()),
  cacheSize: z.number().int().nonnegative(),
  kvCache: z.boolean(),
});

const MOCK_USERS: AdminUser[] = [
  { id: 'local-admin', name: 'Quantara Admin', email: 'admin@quantara.local', role: 'admin' },
  { id: 'local-learner', name: 'Quantara Learner', email: 'learner@quantara.local', role: 'user' },
];

export class LocalAdminService implements AdminService {
  async getOverview(): Promise<AdminOverview> {
    let cascade: CascadeHealth;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'}/health`);
      if (!response.ok) throw new Error(`Health request failed (${response.status})`);
      const health = healthSchema.parse(await response.json());
      cascade = {
        activeTiers: [...health.cf, ...(health.openrouter ? health.openrouterModels : [])],
        cacheSize: health.cacheSize,
        kvCache: health.kvCache,
        openRouterEnabled: health.openrouter,
      };
    } catch (error) {
      cascade = {
        activeTiers: [],
        cacheSize: 0,
        kvCache: false,
        openRouterEnabled: false,
        error: error instanceof Error ? error.message : 'Health check unavailable',
      };
    }

    const users = this.readUsers();
    const quizzes = this.readNumber('quantara.progress', 'quizzes');
    let flashCards = 0;
    try {
      const cards: unknown = JSON.parse(localStorage.getItem('quantara.flashcards') ?? '[]');
      if (Array.isArray(cards)) flashCards = cards.length;
    } catch {
      flashCards = 0;
    }
    const cache: AdminCacheEntry[] = [];
    return {
      counts: {
        users: users.length,
        admins: users.filter((user) => user.role === 'admin').length,
        quizzes,
        attempts: quizzes,
        finished: quizzes,
        quizItems: 0,
        mcqBank: 0,
        aiCache: cascade.cacheSize,
        flashDecks: flashCards ? 1 : 0,
        flashCards,
      },
      users,
      cache,
      cascade,
    };
  }

  async setUserRole(userId: string, role: UserRole): Promise<AdminUser[]> {
    const users = this.readUsers().map((user) => user.id === userId ? { ...user, role } : user);
    localStorage.setItem('quantara.admin-users', JSON.stringify(users));
    return users;
  }

  private readUsers(): AdminUser[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('quantara.admin-users') ?? 'null');
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (user): user is AdminUser =>
            typeof user === 'object' &&
            user !== null &&
            'id' in user &&
            'name' in user &&
            'email' in user &&
            'role' in user &&
            typeof user.id === 'string' &&
            typeof user.name === 'string' &&
            typeof user.email === 'string' &&
            (user.role === 'user' || user.role === 'admin'),
        );
      }
    } catch {
      return [...MOCK_USERS];
    }
    return [...MOCK_USERS];
  }

  private readNumber(key: string, field: string): number {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (typeof parsed === 'object' && parsed !== null && field in parsed) {
        const value = Reflect.get(parsed, field);
        if (typeof value === 'number') return value;
      }
    } catch {
      return 0;
    }
    return 0;
  }
}

export const adminService: AdminService = new LocalAdminService();
