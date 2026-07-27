import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Mocks ────────────────────────────────────────────────────────────────────

let tmpDir: string;

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => tmpDir,
}));

vi.mock('node:http', () => ({
  createServer: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createHash: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue(Buffer.from('mock-hash')),
    }),
    randomBytes: vi.fn().mockReturnValue(Buffer.from('mock-random-bytes-32-chars__')),
  };
});

// ── Imports after mocks ──────────────────────────────────────────────────────

import {
  load_token,
  save_token,
  clear_token,
  is_oauth_enabled,
  oauth_status,
  format_oauth_status,
  apply_bearer,
} from '../dist/oauth.js';
import { redact_url } from '../dist/server-state.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTmpDir() {
  const dir = join(tmpdir(), `oauth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeTokenStore(data: Record<string, any>) {
  writeFileSync(join(tmpDir, 'oauth-tokens.json'), JSON.stringify(data, null, 2));
}

function readTokenStore(): Record<string, any> {
  const path = join(tmpDir, 'oauth-tokens.json');
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('oauth', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    // cleanup
    try {
      const fs = require('node:fs');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('redact_url', () => {
    it('redacts credentials in URLs with userinfo', () => {
      const redacted = redact_url('http://user:pass@example.com/api');
      expect(redacted).not.toContain('user');
      expect(redacted).not.toContain('pass');
      expect(redacted).toContain('***');
      expect(redacted).toContain('example.com');
    });

    it('redacts token/key query params', () => {
      const redacted = redact_url('https://example.com/api?token=secret123');
      expect(redacted).not.toContain('secret123');
      expect(redacted).toContain('***');
    });

    it('returns plain string unchanged if not a URL', () => {
      const input = 'not a url at all';
      expect(redact_url(input)).toBe(input);
    });

    it('handles URLs with no credentials', () => {
      const url = 'https://example.com/api';
      expect(redact_url(url)).toBe(url);
    });
  });

  describe('token lifecycle', () => {
    it('load_token returns undefined for non-existent name', () => {
      expect(load_token('nonexistent')).toBeUndefined();
    });

    it('save_token persists and load_token retrieves', () => {
      const token = {
        access_token: 'at_abc',
        refresh_token: 'rt_xyz',
        expires_at: Date.now() + 3600_000,
      };
      save_token('my-server', token);

      const loaded = load_token('my-server');
      expect(loaded).toEqual(token);
    });

    it('save_token overwrites existing token', () => {
      save_token('my-server', { access_token: 'old' });
      save_token('my-server', { access_token: 'new' });

      expect(load_token('my-server')?.access_token).toBe('new');
    });

    it('save_token preserves other tokens in the store', () => {
      save_token('server-a', { access_token: 'a' });
      save_token('server-b', { access_token: 'b' });

      expect(load_token('server-a')?.access_token).toBe('a');
      expect(load_token('server-b')?.access_token).toBe('b');
    });

    it('clear_token removes a token and returns true', () => {
      save_token('to-clear', { access_token: 'x' });
      expect(clear_token('to-clear')).toBe(true);
      expect(load_token('to-clear')).toBeUndefined();
    });

    it('clear_token returns false for non-existent name', () => {
      expect(clear_token('never-saved')).toBe(false);
    });

    it('clear_token does not affect other tokens', () => {
      save_token('keep', { access_token: 'k' });
      save_token('remove', { access_token: 'r' });
      clear_token('remove');

      expect(load_token('keep')?.access_token).toBe('k');
    });
  });

  describe('is_oauth_enabled', () => {
    it('returns true when transport is http and oauth config is truthy', () => {
      expect(is_oauth_enabled({ transport: 'http', oauth: {}, name: 's' })).toBe(true);
    });

    it('returns false for stdio transport', () => {
      expect(is_oauth_enabled({ transport: 'stdio', command: 'echo', name: 's' })).toBe(false);
    });

    it('returns false for http without oauth config and no stored token', () => {
      expect(is_oauth_enabled({ transport: 'http', name: 'no-token' })).toBe(false);
    });

    it('returns true when a token is stored even without oauth config', () => {
      save_token('has-token', { access_token: 'tok' });
      expect(is_oauth_enabled({ transport: 'http', name: 'has-token' })).toBe(true);
    });
  });

  describe('oauth_status', () => {
    it('returns undefined for stdio transport', () => {
      expect(oauth_status({ transport: 'stdio', command: 'echo', name: 's' })).toBeUndefined();
    });

    it('returns undefined for http without oauth', () => {
      expect(oauth_status({ transport: 'http', name: 'no-auth' })).toBeUndefined();
    });

    it('returns static mode when Authorization header is set', () => {
      expect(
        oauth_status({
          transport: 'http',
          name: 'hdr',
          headers: { Authorization: 'Bearer xyz' },
        })
      ).toEqual({ mode: 'static' });
    });

    it('returns signed-out when oauth enabled but no token', () => {
      const status = oauth_status({ transport: 'http', oauth: {}, name: 'fresh' });
      expect(status).toEqual({ mode: 'oauth', state: 'signed-out' });
    });

    it('returns authenticated when valid token exists', () => {
      save_token('live', {
        access_token: 'at',
        expires_at: Date.now() + 60_000,
      });
      const status = oauth_status({ transport: 'http', oauth: {}, name: 'live' });
      expect(status?.mode).toBe('oauth');
      expect(status?.state).toBe('authenticated');
    });

    it('returns expired when token has expired and no refresh_token', () => {
      save_token('expired', {
        access_token: 'at',
        expires_at: Date.now() - 1000,
      });
      const status = oauth_status({ transport: 'http', oauth: {}, name: 'expired' });
      expect(status?.state).toBe('expired');
    });

    it('returns expired-refreshable when token expired but refresh_token exists', () => {
      save_token('refreshable', {
        access_token: 'at',
        refresh_token: 'rt',
        expires_at: Date.now() - 1000,
      });
      const status = oauth_status({ transport: 'http', oauth: {}, name: 'refreshable' });
      expect(status?.state).toBe('expired-refreshable');
    });
  });

  describe('format_oauth_status', () => {
    it('returns undefined for non-http transport', () => {
      expect(format_oauth_status({ transport: 'stdio', command: 'echo', name: 's' })).toBeUndefined();
    });

    it('returns "static header" for static auth', () => {
      expect(
        format_oauth_status({
          transport: 'http',
          name: 'sh',
          headers: { Authorization: 'Bearer x' },
        })
      ).toBe('static header');
    });

    it('returns "OAuth -- not signed in" for signed-out', () => {
      expect(
        format_oauth_status({ transport: 'http', oauth: {}, name: 'out' })
      ).toBe('OAuth \u2014 not signed in');
    });

    it('returns "OAuth -- signed in" for authenticated', () => {
      save_token('fmt-live', { access_token: 'at', expires_at: Date.now() + 60_000 });
      expect(
        format_oauth_status({ transport: 'http', oauth: {}, name: 'fmt-live' })
      ).toBe('OAuth \u2014 signed in');
    });

    it('returns correct string for expired', () => {
      save_token('fmt-exp', { access_token: 'at', expires_at: Date.now() - 1000 });
      expect(
        format_oauth_status({ transport: 'http', oauth: {}, name: 'fmt-exp' })
      ).toBe('OAuth \u2014 expired, sign in again');
    });

    it('returns correct string for expired-refreshable', () => {
      save_token('fmt-ref', {
        access_token: 'at',
        refresh_token: 'rt',
        expires_at: Date.now() - 1000,
      });
      expect(
        format_oauth_status({ transport: 'http', oauth: {}, name: 'fmt-ref' })
      ).toBe('OAuth \u2014 expired (auto-refresh)');
    });
  });

  describe('apply_bearer', () => {
    it('adds Authorization header to config', () => {
      const result = apply_bearer({ transport: 'http', name: 's' } as any, 'mytoken');
      expect(result.headers?.Authorization).toBe('Bearer mytoken');
    });

    it('preserves existing headers', () => {
      const result = apply_bearer(
        { transport: 'http', name: 's', headers: { 'X-Custom': 'val' } } as any,
        'tok'
      );
      expect(result.headers?.['X-Custom']).toBe('val');
      expect(result.headers?.Authorization).toBe('Bearer tok');
    });

    it('does not mutate original config', () => {
      const original = { transport: 'http', name: 's', headers: {} } as any;
      apply_bearer(original, 'tok');
      expect(original.headers?.Authorization).toBeUndefined();
    });
  });
});
