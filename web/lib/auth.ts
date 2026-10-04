export type UserRole = 'user' | 'admin';

export type AuthSession = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export interface AuthAdapter {
  signIn(): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
}

const SESSION_KEY = 'quantara.dev-session';

export class DevAuthAdapter implements AuthAdapter {
  async signIn(): Promise<AuthSession> {
    const session: AuthSession = {
      id: 'dev-user',
      name: 'Quantara learner',
      email: 'learner@quantara.local',
      role: 'user',
    };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async signOut(): Promise<void> {
    window.localStorage.removeItem(SESSION_KEY);
  }

  async getSession(): Promise<AuthSession | null> {
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null');
      if (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        'name' in value &&
        'email' in value &&
        'role' in value &&
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.email === 'string' &&
        (value.role === 'user' || value.role === 'admin')
      ) {
        return value as AuthSession;
      }
    } catch {
      return null;
    }
    return null;
  }
}

export const authAdapter: AuthAdapter = new DevAuthAdapter();
