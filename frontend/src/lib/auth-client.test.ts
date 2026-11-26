import { describe, expect, it, vi } from 'vitest';
import { AuthClient, type Lock } from './auth-client';
const lock: Lock = operation => operation();
const user = { id: 1, name: 'Fictional student', email: 'student@example.test', createdAt: '2026-01-01' };
const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const loginBody = () => ({ data: { user, accessToken: 'fictional-access', expiresIn: 900 } });
describe('memory-only authentication', () => {
  it('uses cookie credentials for auth but never for profile requests', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ csrfToken: 'csrf' })).mockResolvedValueOnce(response(loginBody())).mockResolvedValueOnce(response({ data: null }));
    const client = new AuthClient({ lock, fetcher }); await client.login('student@example.test', 'Fictional passphrase!'); await client.api('/api/users/career-profile');
    expect(fetcher.mock.calls[0][1].credentials).toBe('include'); expect(fetcher.mock.calls[1][1].headers['X-CSRF-Token']).toBe('csrf');
    expect(fetcher.mock.calls[2][1].credentials).toBe('omit'); expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer fictional-access');
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('deduplicates restoration, including React Strict Mode duplicate effects', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ csrfToken: 'csrf' })).mockResolvedValueOnce(response({ data: { accessToken: 'fresh', expiresIn: 900 } })).mockResolvedValueOnce(response({ data: user }));
    const client = new AuthClient({ lock, fetcher }); await Promise.all([client.restore(), client.restore()]);
    expect(fetcher).toHaveBeenCalledTimes(3); expect(client.getSnapshot().status).toBe('authenticated');
  });
  it('refreshes once for simultaneous expired requests and retries only the denied requests', async () => {
    let profiles = 0, refreshes = 0;
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/csrf')) return response({ csrfToken: 'csrf' });
      if (String(url).endsWith('/login')) return response(loginBody());
      if (String(url).endsWith('/refresh')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); return response({ data: { accessToken: 'fresh', expiresIn: 900 } }); }
      if (String(url).endsWith('/api/users/profile')) return response({ data: user });
      profiles++; return profiles <= 2 ? response({ message: 'Expired' }, 401) : response({ data: null });
    });
    const client = new AuthClient({ lock, fetcher }); await client.login('', ''); await Promise.all([client.api('/api/users/career-profile'), client.api('/api/users/career-profile')]);
    expect(refreshes).toBe(1); expect(profiles).toBe(4);
  });
  it('does not blindly retry an ambiguous refresh network failure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ csrfToken: 'csrf' })).mockRejectedValueOnce(new TypeError('Network'));
    const client = new AuthClient({ lock, fetcher }); await client.restore();
    expect(fetcher).toHaveBeenCalledTimes(2); expect(client.getSnapshot().status).toBe('anonymous');
  });
  it('shows a safe error for a misrouted HTML response instead of exposing a parser failure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('<html>not the API</html>', { status: 200 }));
    const client = new AuthClient({ lock, fetcher }); await client.restore();
    expect(client.getSnapshot().status).toBe('anonymous'); expect(client.getSnapshot().notice).toContain('unexpected response');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not falsely report sign out when the server cannot confirm it', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ csrfToken: 'csrf' })).mockResolvedValueOnce(response(loginBody()))
      .mockResolvedValueOnce(response({ csrfToken: 'csrf' })).mockRejectedValueOnce(new TypeError('Network'));
    const client = new AuthClient({ lock, fetcher }); await client.login('', ''); await expect(client.logout()).rejects.toThrow();
    expect(client.getSnapshot().status).toBe('authenticated');
  });
  it('clears local session only after confirmed sign out and notifies other tabs', async () => {
    const announce = vi.fn(); const fetcher = vi.fn().mockResolvedValueOnce(response({ csrfToken: 'csrf' })).mockResolvedValueOnce(response(loginBody()))
      .mockResolvedValueOnce(response({ csrfToken: 'csrf' })).mockResolvedValueOnce(response(null, 204));
    const client = new AuthClient({ lock, fetcher, announce }); await client.login('', ''); await client.logout();
    expect(client.getSnapshot().status).toBe('anonymous'); expect(announce).toHaveBeenLastCalledWith('signed-out');
  });
  it('does not replay an old-account edit into a newly signed-in account', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(response({ csrfToken: 'csrf' })).mockResolvedValueOnce(response(loginBody()))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const client = new AuthClient({ lock, fetcher }); await client.login('', '');
    const saving = client.api('/api/users/career-profile', { method: 'PATCH', body: '{"bio":"old user"}' });
    client.invalidate('Another tab changed accounts'); finish(response({}, 401)); await expect(saving).rejects.toThrow('session changed');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('does not silently renew sessions without a cross-tab lock', async () => {
    const fetcher = vi.fn(); const client = new AuthClient({ lock, fetcher, canRefresh: false }); await client.restore();
    expect(fetcher).not.toHaveBeenCalled(); expect(client.getSnapshot().status).toBe('anonymous');
  });
  it('checks the renewed identity before sending an old-account edit, even without a tab notification', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ csrfToken: 'csrf' }))
      .mockResolvedValueOnce(response({ data: { user, accessToken: 'old', expiresIn: 0 } }))
      .mockResolvedValueOnce(response({ csrfToken: 'csrf' }))
      .mockResolvedValueOnce(response({ data: { accessToken: 'other-account', expiresIn: 900 } }))
      .mockResolvedValueOnce(response({ data: { ...user, id: 2 } }));
    const client = new AuthClient({ lock, fetcher }); await client.login('', '');
    await expect(client.api('/api/users/career-profile', { method: 'PATCH', body: '{"bio":"old user"}' })).rejects.toThrow('account changed');
    expect(fetcher.mock.calls.some(call => call[1]?.method === 'PATCH')).toBe(false);
    expect(client.getSnapshot().status).toBe('anonymous');
  });
});
