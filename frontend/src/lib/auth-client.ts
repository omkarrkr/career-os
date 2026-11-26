import type { User } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}) { super(message); }
}
type State = { status: 'loading' | 'authenticated' | 'anonymous'; user: User | null; notice: string };
type Fetcher = typeof fetch;
export type Lock = <T>(operation: () => Promise<T>) => Promise<T>;
type Options = { origin?: string; fetcher?: Fetcher; lock: Lock; canRefresh?: boolean; announce?: (event: string) => void };

// Tokens are intentionally memory-only. Only the browser manages HttpOnly cookies.
export class AuthClient {
  private access = '';
  private expiresAt = 0;
  private generation = 0;
  private state: State = { status: 'loading', user: null, notice: '' };
  private listeners = new Set<() => void>();
  private refreshing: Promise<void> | null = null;
  private restoring: Promise<void> | null = null;
  private fetcher: Fetcher;
  private origin: string;
  constructor(private options: Options) {
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.origin = options.origin?.replace(/\/$/, '') ?? '';
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(state: State) { this.state = state; this.listeners.forEach(listener => listener()); }
  invalidate = (notice = '') => {
    this.generation++; this.access = ''; this.expiresAt = 0;
    this.update({ status: 'anonymous', user: null, notice });
  };
  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(this.origin + path, { ...init, signal: init.signal ?? AbortSignal.timeout(15000), cache: 'no-store' });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new ApiError(0, 'Could not reach CareerOS. Check your connection and try again.');
    }
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const fields: Record<string, string> = {};
      if (Array.isArray(body?.errors)) for (const issue of body.errors) {
        if (typeof issue.field === 'string' && typeof issue.message === 'string') fields[issue.field] = issue.message;
      }
      throw new ApiError(response.status, response.status === 429 ? 'Too many attempts. Please wait before trying again.' : body?.message || 'The request could not be completed.', fields);
    }
    if (response.status !== 204 && (!body || typeof body !== 'object' || Array.isArray(body))) {
      throw new ApiError(502, 'CareerOS returned an unexpected response. Please try again.');
    }
    return body as T;
  }
  private csrf() { return this.json<{ csrfToken: string }>('/api/auth/csrf', { credentials: 'include' }); }
  private authPost<T>(path: string, csrf: string, body: unknown) {
    return this.json<T>('/api/auth/' + path, { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
  }
  private token(data: { accessToken: string; expiresIn: number }) {
    this.access = data.accessToken; this.expiresAt = Date.now() + data.expiresIn * 1000;
  }
  restore = (): Promise<void> => {
    if (this.state.status !== 'loading') return Promise.resolve();
    if (!this.restoring) this.restoring = this.refresh().catch(error => { this.invalidate(error instanceof ApiError && error.status === 401 ? '' : error.message); });
    return this.restoring;
  };
  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const expectedUserId = this.state.user?.id;
    this.refreshing = this.options.lock(async () => {
      if (this.options.canRefresh === false) throw new ApiError(401, 'Please sign in. Session renewal needs a browser with Web Locks support.');
      const { csrfToken } = await this.csrf();
      const response = await this.authPost<{ data: { accessToken: string; expiresIn: number } }>('refresh', csrfToken, {});
      // Cookies are shared by tabs. Verify identity before replaying any saved request.
      const identity = await this.json<{ data: User }>('/api/users/profile', {
        credentials: 'omit', headers: { Authorization: `Bearer ${response.data.accessToken}` },
      });
      if (generation !== this.generation) throw new ApiError(401, 'Your session changed. Please sign in again.');
      if (expectedUserId !== undefined && identity.data.id !== expectedUserId) throw new ApiError(401, 'The signed-in account changed. Please sign in again.');
      this.token(response.data);
      this.update({ status: 'authenticated', user: identity.data, notice: '' });
    }).catch(error => { if (generation === this.generation) this.invalidate(error.status === 401 ? 'Your session ended. Please sign in again.' : 'Could not confirm session renewal. Please sign in again.'); throw error; })
      .finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async login(email: string, password: string) {
    await this.options.lock(async () => {
      const { csrfToken } = await this.csrf();
      const response = await this.authPost<{ data: { accessToken: string; expiresIn: number; user: User } }>('login', csrfToken, { email, password });
      this.generation++; this.token(response.data);
      this.update({ status: 'authenticated', user: response.data.user, notice: '' }); this.options.announce?.('changed');
    });
  }
  async register(name: string, email: string, password: string) {
    await this.json('/api/users/register', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
  }
  async logout() {
    await this.options.lock(async () => {
      const { csrfToken } = await this.csrf();
      await this.authPost('logout', csrfToken, {});
      this.invalidate(); this.options.announce?.('signed-out');
    });
  }
  async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const generation = this.generation;
    const assertSession = () => { if (generation !== this.generation) throw new ApiError(401, 'Your session changed. Please sign in again.'); };
    if (!this.access || this.expiresAt <= Date.now() + 5000) await this.refresh();
    assertSession();
    const request = () => this.json<T>(path, { ...init, credentials: 'omit', headers: { ...init.headers, Authorization: `Bearer ${this.access}` } });
    let result: T;
    try { result = await request(); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      assertSession();
      await this.refresh();
      assertSession();
      try { result = await request(); } catch (retryError) { if (retryError instanceof ApiError && retryError.status === 401) this.invalidate('Please sign in again.'); throw retryError; }
    }
    assertSession();
    return result;
  }
}
