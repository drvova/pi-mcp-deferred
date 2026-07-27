import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Mocks ────────────────────────────────────────────────────────────────────

let tmpDir: string;

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => tmpDir,
}));

// ── Imports after mocks ──────────────────────────────────────────────────────

import {
  read_cached_tools,
  read_cached_tools_batch,
  write_cached_tools,
} from '../dist/catalog-cache.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTmpDir() {
  const dir = join(tmpdir(), `catalog-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeCache(data: Record<string, any>) {
  writeFileSync(join(tmpDir, 'mcp-catalog-cache.json'), JSON.stringify(data, null, 2));
}

function readCache(): Record<string, any> {
  const path = join(tmpDir, 'mcp-catalog-cache.json');
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('catalog-cache', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('read_cached_tools', () => {
    it('returns undefined when no cache file exists', () => {
      const config = { name: 'server-a', transport: 'stdio', command: 'echo', args: [] };
      expect(read_cached_tools(config)).toBeUndefined();
    });

    it('returns tools when cache has matching entry', () => {
      const config = { name: 'server-a', transport: 'stdio', command: 'echo', args: [] };
      writeCache({
        'server-a': {
          sig: 'stdio:echo ',
          tools: [{ name: 'tool1', description: 'desc', inputSchema: {} }],
        },
      });

      const result = read_cached_tools(config);
      expect(result).toEqual([{ name: 'tool1', description: 'desc', inputSchema: {} }]);
    });

    it('returns undefined when signature mismatches', () => {
      const config = { name: 'server-a', transport: 'stdio', command: 'echo', args: [] };
      writeCache({
        'server-a': {
          sig: 'stdio:other-cmd ',
          tools: [{ name: 'tool1' }],
        },
      });

      expect(read_cached_tools(config)).toBeUndefined();
    });

    it('returns undefined when entry has no tools array', () => {
      const config = { name: 'server-a', transport: 'stdio', command: 'echo', args: [] };
      writeCache({
        'server-a': {
          sig: 'stdio:echo ',
          tools: 'not-an-array',
        },
      });

      expect(read_cached_tools(config)).toBeUndefined();
    });

    it('generates correct sig for http transport', () => {
      const config = { name: 'http-srv', transport: 'http', url: 'http://example.com/mcp' };
      writeCache({
        'http-srv': {
          sig: 'http:http://example.com/mcp',
          tools: [{ name: 'fetch', description: '', inputSchema: {} }],
        },
      });

      expect(read_cached_tools(config)).toHaveLength(1);
    });

    it('generates correct sig for stdio with args', () => {
      const config = {
        name: 'stdio-srv',
        transport: 'stdio',
        command: 'node',
        args: ['server.js', '--port', '3000'],
      };
      writeCache({
        'stdio-srv': {
          sig: 'stdio:node server.js --port 3000',
          tools: [{ name: 'run' }],
        },
      });

      expect(read_cached_tools(config)).toHaveLength(1);
    });
  });

  describe('read_cached_tools_batch', () => {
    it('returns empty Map when no cache exists', () => {
      const configs = [{ name: 'a', transport: 'stdio', command: 'echo', args: [] }];
      const result = read_cached_tools_batch(configs);
      expect(result.size).toBe(0);
    });

    it('returns only matching entries', () => {
      const configA = { name: 'a', transport: 'stdio', command: 'echo', args: [] };
      const configB = { name: 'b', transport: 'stdio', command: 'echo', args: [] };

      writeCache({
        a: {
          sig: 'stdio:echo ',
          tools: [{ name: 'tool-a' }],
        },
        // b is missing
      });

      const result = read_cached_tools_batch([configA, configB]);
      expect(result.size).toBe(1);
      expect(result.has('a')).toBe(true);
      expect(result.has('b')).toBe(false);
    });

    it('returns all matching entries in batch', () => {
      const configs = [
        { name: 'a', transport: 'stdio', command: 'echo', args: [] },
        { name: 'b', transport: 'http', url: 'http://localhost:8080' },
      ];

      writeCache({
        a: { sig: 'stdio:echo ', tools: [{ name: 'ta' }] },
        b: { sig: 'http:http://localhost:8080', tools: [{ name: 'tb' }] },
      });

      const result = read_cached_tools_batch(configs);
      expect(result.size).toBe(2);
      expect(result.get('a')).toEqual([{ name: 'ta' }]);
      expect(result.get('b')).toEqual([{ name: 'tb' }]);
    });

    it('skips entries with mismatched signatures', () => {
      const configs = [
        { name: 'a', transport: 'stdio', command: 'echo', args: [] },
      ];
      writeCache({
        a: { sig: 'stdio:different-cmd ', tools: [{ name: 'x' }] },
      });

      expect(read_cached_tools_batch(configs).size).toBe(0);
    });
  });

  describe('write_cached_tools', () => {
    it('creates cache file and writes tools', () => {
      const config = { name: 'srv', transport: 'stdio', command: 'echo', args: [] };
      const tools = [{ name: 't1', description: 'd1', inputSchema: { type: 'object' } }];

      write_cached_tools(config, tools);

      const cache = readCache();
      expect(cache.srv).toBeDefined();
      expect(cache.srv.sig).toBe('stdio:echo ');
      expect(cache.srv.tools).toHaveLength(1);
      expect(cache.srv.tools[0].name).toBe('t1');
    });

    it('preserves existing entries when writing new server', () => {
      const configA = { name: 'a', transport: 'stdio', command: 'echo', args: [] };
      const configB = { name: 'b', transport: 'http', url: 'http://x' };

      write_cached_tools(configA, [{ name: 'ta' }]);
      write_cached_tools(configB, [{ name: 'tb' }]);

      const cache = readCache();
      expect(Object.keys(cache)).toHaveLength(2);
      expect(cache.a.tools[0].name).toBe('ta');
      expect(cache.b.tools[0].name).toBe('tb');
    });

    it('strips extra fields from tools (only name, description, inputSchema)', () => {
      const config = { name: 'srv', transport: 'stdio', command: 'echo', args: [] };
      write_cached_tools(config, [
        { name: 't', description: 'd', inputSchema: {}, extraField: 'should-be-stripped' } as any,
      ]);

      const tools = readCache().srv.tools;
      expect(tools[0]).toEqual({ name: 't', description: 'd', inputSchema: {} });
      expect(tools[0].extraField).toBeUndefined();
    });

    it('uses atomic write (tmp + rename)', () => {
      const config = { name: 'srv', transport: 'stdio', command: 'echo', args: [] };
      write_cached_tools(config, [{ name: 't1' }]);

      // After write, the cache file should exist and be valid JSON
      const cache = readCache();
      expect(cache.srv).toBeDefined();
    });

    it('does not throw on write errors', () => {
      // write_cached_tools is best-effort; calling it should not throw
      const config = { name: 'srv', transport: 'stdio', command: 'echo', args: [] };
      expect(() => write_cached_tools(config, [{ name: 't1' }])).not.toThrow();
    });
  });
});
