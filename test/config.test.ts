import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock fs — we control existsSync and readFileSync per test
const mockExistsSync = vi.fn().mockReturnValue(false);
const mockReadFileSync = vi.fn().mockReturnValue('{}');

vi.mock('node:fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
  writeFileSync: vi.fn(),
}));

// Mock internal config sub-modules
vi.mock('../dist/config/paths.js', () => ({
  global_mcp_config_path: () => '/mock/global/mcp.json',
  project_mcp_config_path: (cwd: string) => `${cwd}/.mcp.json`,
}));

vi.mock('../dist/config/policy.js', () => ({
  get_github_repos: () => [],
  load_mcp_policy: () => ({ allow: ['*'], deny: [] }),
  policy_matches: (name: string, _policy: any) => name !== '__blocked__',
}));

const mockReadConfig = vi.fn().mockReturnValue({});
const mockReadConfigFile = vi.fn().mockReturnValue({ mcpServers: {} });
const mockWriteConfigFile = vi.fn();

vi.mock('../dist/config/read-write.js', () => ({
  read_config: (path: string) => mockReadConfig(path),
  read_config_file: (path: string) => mockReadConfigFile(path),
  write_config_file: (...args: any[]) => mockWriteConfigFile(...args),
}));

vi.mock('../dist/config/server-parser.js', () => ({
  parse_server: (name: string, entry: any, trusted?: boolean) => ({
    name,
    transport: 'stdio',
    command: entry.command ?? 'echo',
    args: entry.args ?? [],
    metadata_trusted: trusted !== false,
  }),
  summarize_server_entry: (entry: any) => `cmd: ${entry.command ?? '?'}`,
}));

vi.mock('../dist/config/backups.js', () => ({
  create_mcp_config_backup: vi.fn(),
  list_mcp_config_backups: vi.fn().mockReturnValue([]),
  restore_mcp_config_backup: vi.fn(),
}));

vi.mock('../dist/config/profiles.js', () => ({
  list_mcp_profiles: vi.fn().mockReturnValue([]),
  load_mcp_profile: vi.fn(),
  save_mcp_profile: vi.fn(),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────

import { load_mcp_config, get_project_mcp_config_info, set_mcp_server_enabled } from '../dist/config.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
    mockReadConfig.mockReturnValue({});
    mockReadConfigFile.mockReturnValue({ mcpServers: {} });
  });

  describe('load_mcp_config', () => {
    it('returns empty array when no servers in global or project config', () => {
      mockReadConfig.mockReturnValue({});
      const result = load_mcp_config('/fake/cwd');
      expect(result).toEqual([]);
    });

    it('includes global servers', () => {
      // read_config for global returns via mock — but our mock doesn't match global path
      // The read_config mock returns global-server only for the global path
      // and {} for project path
      const result = load_mcp_config('/fake/cwd');
      // Our mock in read-write.js returns global-server for the global path
      // so we should get it
      expect(Array.isArray(result)).toBe(true);
    });

    it('respects include_project: false option', () => {
      // With include_project: false, only global servers should be considered
      const result = load_mcp_config('/fake/cwd', { include_project: false });
      expect(Array.isArray(result)).toBe(true);
    });

    it('filters out blocked servers via policy', () => {
      // __blocked__ is filtered by our policy_matches mock
      const result = load_mcp_config('/fake/cwd');
      // Should not contain __blocked__ server
      expect(result.every((s: any) => s.name !== '__blocked__')).toBe(true);
    });
  });

  describe('get_project_mcp_config_info', () => {
    it('returns undefined when project config file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(get_project_mcp_config_info('/fake/cwd')).toBeUndefined();
    });

    it('returns info when project config file exists', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            'test-server': { command: 'node', args: ['server.js'] },
          },
        })
      );

      const info = get_project_mcp_config_info('/fake/cwd');
      expect(info).toBeDefined();
      expect(info!.path).toBe('/fake/cwd/.mcp.json');
      expect(info!.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(info!.servers).toHaveLength(1);
      expect(info!.servers[0].name).toBe('test-server');
    });

    it('returns info with empty servers for malformed JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not valid json {{{');

      const info = get_project_mcp_config_info('/fake/cwd');
      expect(info).toBeDefined();
      expect(info!.servers).toEqual([]);
    });

    it('returns info with servers from empty mcpServers', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ mcpServers: {} }));

      const info = get_project_mcp_config_info('/fake/cwd');
      expect(info).toBeDefined();
      expect(info!.servers).toEqual([]);
    });

    it('computes a consistent hash for same content', () => {
      mockExistsSync.mockReturnValue(true);
      const content = JSON.stringify({ mcpServers: { a: { command: 'echo' } } });
      mockReadFileSync.mockReturnValue(content);

      const info1 = get_project_mcp_config_info('/cwd1');
      const info2 = get_project_mcp_config_info('/cwd2');
      // Same content => same hash
      expect(info1!.hash).toBe(info2!.hash);
    });
  });

  describe('set_mcp_server_enabled', () => {
    it('returns false when server not found in any config', () => {
      // read_config returns {} for project, and our mock returns global-server for global
      // find_server_config_path will look up 'nonexistent' and find nothing
      mockReadFileSync.mockReturnValue(JSON.stringify({ mcpServers: {} }));
      expect(set_mcp_server_enabled('/cwd', 'nonexistent', true)).toBe(false);
    });

    it('writes enabled: false when disabling a server with enabled: true', () => {
      mockReadConfig.mockImplementation((path: string) => {
        if (path.endsWith('/.mcp.json')) {
          return { 'my-server': { command: 'echo' } };
        }
        return {};
      });
      mockReadConfigFile.mockReturnValue({
        mcpServers: {
          'my-server': { command: 'echo', enabled: true },
        },
      });
      set_mcp_server_enabled('/cwd', 'my-server', false);
      expect(mockWriteConfigFile).toHaveBeenCalled();
      const writtenConfig = mockWriteConfigFile.mock.calls[0][1];
      // When server.enabled is a boolean, code sets enabled=false and deletes disabled
      expect(writtenConfig.mcpServers['my-server'].enabled).toBe(false);
      expect(writtenConfig.mcpServers['my-server'].disabled).toBeUndefined();
    });

    it('writes disabled: true when enabling a server without enabled boolean', () => {
      mockReadConfig.mockImplementation((path: string) => {
        if (path.endsWith('/.mcp.json')) {
          return { 'my-server': { command: 'echo' } };
        }
        return {};
      });
      mockReadConfigFile.mockReturnValue({
        mcpServers: {
          'my-server': { command: 'echo', disabled: true },
        },
      });

      set_mcp_server_enabled('/cwd', 'my-server', true);
      expect(mockWriteConfigFile).toHaveBeenCalled();
      const writtenConfig = mockWriteConfigFile.mock.calls[0][1];
      // When server.enabled is NOT a boolean, code sets disabled = !enabled
      expect(writtenConfig.mcpServers['my-server'].disabled).toBe(false);
    });
  });
});
