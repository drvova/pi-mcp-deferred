import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

// --- trust.js mocks ---
const mockGetAgentDir = vi.fn().mockReturnValue('/mock/agent/dir');
const mockIsProjectSubjectTrusted = vi.fn().mockReturnValue(false);
const mockReadProjectTrustStore = vi.fn().mockReturnValue({});
const mockTrustProjectSubject = vi.fn();

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: (...args: any[]) => mockGetAgentDir(...args),
}));

vi.mock('@spences10/pi-project-trust', () => ({
  is_project_subject_trusted: (...args: any[]) => mockIsProjectSubjectTrusted(...args),
  read_project_trust_store: (...args: any[]) => mockReadProjectTrustStore(...args),
  trust_project_subject: (...args: any[]) => mockTrustProjectSubject(...args),
}));

// --- env.js mock ---
const mockCreateSharedChildProcessEnv = vi.fn().mockReturnValue({ PATH: '/usr/bin' });

vi.mock('@spences10/pi-child-env', () => ({
  create_child_process_env: (...args: any[]) => mockCreateSharedChildProcessEnv(...args),
}));

// --- backup-restore.js mocks ---
const mockCreateMcpConfigBackup = vi.fn().mockReturnValue({
  filename: 'backup-2024.json',
  global_server_count: 1,
  project_server_count: 2,
});
const mockListMcpConfigBackups = vi.fn().mockReturnValue([]);
const mockRestoreMcpConfigBackup = vi.fn().mockReturnValue({
  filename: 'backup-2024.json',
});
const mockShowConfirmModal = vi.fn().mockResolvedValue(true);
const mockShowPickerModal = vi.fn().mockResolvedValue(null);

vi.mock('@spences10/pi-tui-modal', () => ({
  show_confirm_modal: (...args: any[]) => mockShowConfirmModal(...args),
  show_picker_modal: (...args: any[]) => mockShowPickerModal(...args),
}));

// --- project-config-loader.js mocks ---
const mockGetProjectMcpConfigInfo = vi.fn().mockReturnValue(undefined);
const mockResolveProjectTrust = vi.fn().mockResolvedValue({ action: 'skip' });

vi.mock('../dist/config.js', () => ({
  get_project_mcp_config_info: (...args: any[]) => mockGetProjectMcpConfigInfo(...args),
  create_mcp_config_backup: (...args: any[]) => mockCreateMcpConfigBackup(...args),
  list_mcp_config_backups: (...args: any[]) => mockListMcpConfigBackups(...args),
  restore_mcp_config_backup: (...args: any[]) => mockRestoreMcpConfigBackup(...args),
}));
vi.mock('@spences10/pi-project-trust', () => ({
  is_project_subject_trusted: (...args: any[]) => mockIsProjectSubjectTrusted(...args),
  read_project_trust_store: (...args: any[]) => mockReadProjectTrustStore(...args),
  trust_project_subject: (...args: any[]) => mockTrustProjectSubject(...args),
  resolve_project_trust: (...args: any[]) => mockResolveProjectTrust(...args),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────

import { is_project_mcp_config_trusted, trust_project_mcp_config, create_mcp_project_trust_subject, default_mcp_trust_store_path } from '../dist/trust.js';
import { create_child_process_env } from '../dist/env.js';
import { reload_after_config_change, handle_mcp_backup, confirm_mcp_action, handle_mcp_restore } from '../dist/backup-restore.js';
import { get_project_mcp_config_load_decision } from '../dist/project-config-loader.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    cwd: '/fake/cwd',
    hasUI: true,
    reload: vi.fn().mockResolvedValue(undefined),
    ui: {
      notify: vi.fn(),
      confirm: vi.fn().mockResolvedValue(true),
      select: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('trust.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAgentDir.mockReturnValue('/mock/agent/dir');
    mockIsProjectSubjectTrusted.mockReturnValue(false);
    mockReadProjectTrustStore.mockReturnValue({});
  });

  describe('default_mcp_trust_store_path', () => {
    it('returns a path derived from getAgentDir', () => {
      const result = default_mcp_trust_store_path();
      expect(mockGetAgentDir).toHaveBeenCalled();
      expect(result).toBe('/mock/agent/dir/trusted-mcp-projects.json');
    });
  });

  describe('create_mcp_project_trust_subject', () => {
    it('returns a subject with kind mcp-config and given path/hash', () => {
      const result = create_mcp_project_trust_subject('/some/path', 'hash123');
      expect(result).toEqual({
        kind: 'mcp-config',
        id: '/some/path',
        hash: 'hash123',
        store_key: '/some/path',
        env_key: 'MY_PI_MCP_PROJECT_CONFIG',
        prompt_title: 'Project mcp.json can spawn local commands. Trust this config?',
      });
    });
  });

  describe('is_project_mcp_config_trusted', () => {
    it('returns true when new trust system recognizes the subject', () => {
      mockIsProjectSubjectTrusted.mockReturnValue(true);
      expect(is_project_mcp_config_trusted('/p', 'h1')).toBe(true);
    });

    it('returns true when legacy trust store has matching entry', () => {
      mockIsProjectSubjectTrusted.mockReturnValue(false);
      mockReadProjectTrustStore.mockReturnValue({
        '/p': { path: '/p', hash: 'h1' },
      });
      expect(is_project_mcp_config_trusted('/p', 'h1')).toBe(true);
    });

    it('returns false when neither trust system recognizes the entry', () => {
      mockIsProjectSubjectTrusted.mockReturnValue(false);
      mockReadProjectTrustStore.mockReturnValue({});
      expect(is_project_mcp_config_trusted('/p', 'h1')).toBe(false);
    });

    it('returns false when legacy entry has wrong hash', () => {
      mockIsProjectSubjectTrusted.mockReturnValue(false);
      mockReadProjectTrustStore.mockReturnValue({
        '/p': { path: '/p', hash: 'wrong-hash' },
      });
      expect(is_project_mcp_config_trusted('/p', 'h1')).toBe(false);
    });

    it('returns false when legacy entry has wrong path', () => {
      mockIsProjectSubjectTrusted.mockReturnValue(false);
      mockReadProjectTrustStore.mockReturnValue({
        '/p': { path: '/other', hash: 'h1' },
      });
      expect(is_project_mcp_config_trusted('/p', 'h1')).toBe(false);
    });

    it('uses custom trust_store_path when provided', () => {
      mockIsProjectSubjectTrusted.mockReturnValue(true);
      is_project_mcp_config_trusted('/p', 'h1', '/custom/store.json');
      expect(mockIsProjectSubjectTrusted).toHaveBeenCalledWith(
        expect.objectContaining({ id: '/p', hash: 'h1' }),
        '/custom/store.json',
      );
    });
  });

  describe('trust_project_mcp_config', () => {
    it('calls trust_project_subject with correct subject', () => {
      trust_project_mcp_config('/p', 'h1');
      expect(mockTrustProjectSubject).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'mcp-config', id: '/p', hash: 'h1' }),
        expect.any(String),
      );
    });

    it('uses custom trust_store_path when provided', () => {
      trust_project_mcp_config('/p', 'h1', '/custom/store.json');
      expect(mockTrustProjectSubject).toHaveBeenCalledWith(
        expect.objectContaining({ id: '/p' }),
        '/custom/store.json',
      );
    });
  });
});

describe('env.js', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.clearAllMocks();
  });

  describe('create_child_process_env', () => {
    it('delegates to shared child process env with profile mcp', () => {
      const sourceEnv = { PATH: '/usr/bin', HOME: '/home/user' };
      create_child_process_env({}, sourceEnv);

      expect(mockCreateSharedChildProcessEnv).toHaveBeenCalledWith({
        profile: 'mcp',
        explicit_env: {},
        source_env: sourceEnv,
      });
    });

    it('merges explicit_env into the call', () => {
      create_child_process_env({ FOO: 'bar' }, { PATH: '/usr/bin' });

      expect(mockCreateSharedChildProcessEnv).toHaveBeenCalledWith({
        profile: 'mcp',
        explicit_env: { FOO: 'bar' },
        source_env: { PATH: '/usr/bin' },
      });
    });

    it('defaults explicit_env to empty object', () => {
      create_child_process_env(undefined, { PATH: '/usr/bin' });

      expect(mockCreateSharedChildProcessEnv).toHaveBeenCalledWith({
        profile: 'mcp',
        explicit_env: {},
        source_env: { PATH: '/usr/bin' },
      });
    });

    it('defaults source_env to process.env', () => {
      create_child_process_env({ A: '1' });

      expect(mockCreateSharedChildProcessEnv).toHaveBeenCalledWith(
        expect.objectContaining({ source_env: process.env }),
      );
    });

    it('passes through result from shared function', () => {
      mockCreateSharedChildProcessEnv.mockReturnValueOnce({ MERGED: 'env' });
      const result = create_child_process_env({ A: '1' }, { PATH: '/usr/bin' });
      expect(result).toEqual({ MERGED: 'env' });
    });
  });

  describe('create_child_process_env (Windows)', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });

    it('includes Windows-specific env vars from source_env', () => {
      const sourceEnv = {
        PATH: '/usr/bin',
        APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
        USERPROFILE: 'C:\\Users\\test',
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
        ComSpec: 'C:\\Windows\\system32\\cmd.exe',
        SystemRoot: 'C:\\Windows',
      };

      create_child_process_env({}, sourceEnv);

      const call = mockCreateSharedChildProcessEnv.mock.calls[0][0];
      expect(call.explicit_env.APPDATA).toBe('C:\\Users\\test\\AppData\\Roaming');
      expect(call.explicit_env.USERPROFILE).toBe('C:\\Users\\test');
      expect(call.explicit_env.LOCALAPPDATA).toBe('C:\\Users\\test\\AppData\\Local');
      expect(call.explicit_env.ComSpec).toBe('C:\\Windows\\system32\\cmd.exe');
      expect(call.explicit_env.SystemRoot).toBe('C:\\Windows');
    });

    it('omits undefined Windows env vars', () => {
      const sourceEnv = { PATH: '/usr/bin' };

      create_child_process_env({}, sourceEnv);

      const call = mockCreateSharedChildProcessEnv.mock.calls[0][0];
      expect(call.explicit_env).not.toHaveProperty('APPDATA');
      expect(call.explicit_env).not.toHaveProperty('USERPROFILE');
    });

    it('explicit_env overrides Windows env vars', () => {
      const sourceEnv = { APPDATA: 'C:\\original' };

      create_child_process_env({ APPDATA: 'C:\\override' }, sourceEnv);

      const call = mockCreateSharedChildProcessEnv.mock.calls[0][0];
      expect(call.explicit_env.APPDATA).toBe('C:\\override');
    });
  });
});

describe('backup-restore.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMcpConfigBackup.mockReturnValue({
      filename: 'backup-2024.json',
      global_server_count: 1,
      project_server_count: 2,
    });
    mockListMcpConfigBackups.mockReturnValue([]);
    mockRestoreMcpConfigBackup.mockReturnValue({ filename: 'backup-2024.json' });
    mockShowConfirmModal.mockResolvedValue(true);
    mockShowPickerModal.mockResolvedValue(null);
  });

  describe('reload_after_config_change', () => {
    it('notifies and calls ctx.reload', async () => {
      const ctx = makeCtx();
      await reload_after_config_change(ctx, 'Config updated.');

      expect(ctx.ui.notify).toHaveBeenCalledWith('Config updated. Reloading MCP extension...', 'info');
      expect(ctx.reload).toHaveBeenCalled();
    });
  });

  describe('handle_mcp_backup', () => {
    it('creates backup and notifies with counts', async () => {
      const ctx = makeCtx();
      await handle_mcp_backup(ctx);

      expect(mockCreateMcpConfigBackup).toHaveBeenCalledWith(ctx.cwd);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        'MCP backup created: backup-2024.json (1 global, 2 project servers)',
        'info',
      );
    });
  });

  describe('confirm_mcp_action', () => {
    it('uses show_confirm_modal when ctx.hasUI is true', async () => {
      const ctx = makeCtx({ hasUI: true });
      const result = await confirm_mcp_action(ctx, {
        title: 'Confirm?',
        message: 'Are you sure?',
        confirm_label: 'Yes',
      });

      expect(mockShowConfirmModal).toHaveBeenCalledWith(ctx, {
        title: 'Confirm?',
        message: 'Are you sure?',
        confirm_label: 'Yes',
      });
      expect(result).toBe(true);
    });

    it('falls back to ctx.ui.confirm when ctx.hasUI is false', async () => {
      const ctx = makeCtx({ hasUI: false });
      ctx.ui.confirm.mockResolvedValue(false);

      const result = await confirm_mcp_action(ctx, {
        title: 'Confirm?',
        message: 'Are you sure?',
      });

      expect(ctx.ui.confirm).toHaveBeenCalledWith('Confirm?', 'Are you sure?');
      expect(result).toBe(false);
    });
  });

  describe('handle_mcp_restore', () => {
    it('returns false and warns when no backups exist', async () => {
      mockListMcpConfigBackups.mockReturnValue([]);
      const ctx = makeCtx();

      const result = await handle_mcp_restore(ctx);

      expect(result).toBe(false);
      expect(ctx.ui.notify).toHaveBeenCalledWith('No MCP backups found', 'warning');
    });

    it('prompts picker when requested_file not given and backups exist', async () => {
      mockListMcpConfigBackups.mockReturnValue([
        { filename: 'b1.json', path: '/backups/b1.json', global_server_count: 1, project_server_count: 0, created_at: '2024-01-01' },
      ]);
      mockShowPickerModal.mockResolvedValue(null);
      const ctx = makeCtx();

      const result = await handle_mcp_restore(ctx);

      expect(mockShowPickerModal).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('matches requested_file by filename', async () => {
      mockListMcpConfigBackups.mockReturnValue([
        { filename: 'b1.json', path: '/backups/b1.json', global_server_count: 1, project_server_count: 0, created_at: '2024-01-01' },
      ]);
      mockShowConfirmModal.mockResolvedValue(true);
      mockRestoreMcpConfigBackup.mockReturnValue({ filename: 'b1.json' });
      const ctx = makeCtx();

      const result = await handle_mcp_restore(ctx, 'b1.json');

      expect(result).toBe(true);
      expect(mockRestoreMcpConfigBackup).toHaveBeenCalledWith(ctx.cwd, '/backups/b1.json');
    });

    it('matches requested_file by path', async () => {
      mockListMcpConfigBackups.mockReturnValue([
        { filename: 'b1.json', path: '/backups/b1.json', global_server_count: 1, project_server_count: 0, created_at: '2024-01-01' },
      ]);
      mockShowConfirmModal.mockResolvedValue(true);
      mockRestoreMcpConfigBackup.mockReturnValue({ filename: 'b1.json' });
      const ctx = makeCtx();

      const result = await handle_mcp_restore(ctx, '/backups/b1.json');

      expect(result).toBe(true);
    });

    it('returns false when requested_file does not match any backup', async () => {
      mockListMcpConfigBackups.mockReturnValue([
        { filename: 'b1.json', path: '/backups/b1.json', global_server_count: 1, project_server_count: 0, created_at: '2024-01-01' },
      ]);
      const ctx = makeCtx();

      const result = await handle_mcp_restore(ctx, 'nonexistent.json');

      // Falls through to picker, picker returns null, so false
      expect(result).toBe(false);
    });

    it('returns false when user cancels confirmation', async () => {
      mockListMcpConfigBackups.mockReturnValue([
        { filename: 'b1.json', path: '/backups/b1.json', global_server_count: 1, project_server_count: 0, created_at: '2024-01-01' },
      ]);
      mockShowConfirmModal.mockResolvedValue(false);
      const ctx = makeCtx();

      const result = await handle_mcp_restore(ctx, 'b1.json');

      expect(result).toBe(false);
      expect(mockRestoreMcpConfigBackup).not.toHaveBeenCalled();
    });

    it('restores, reloads, and returns true on success', async () => {
      mockListMcpConfigBackups.mockReturnValue([
        { filename: 'b1.json', path: '/backups/b1.json', global_server_count: 1, project_server_count: 0, created_at: '2024-01-01' },
      ]);
      mockShowConfirmModal.mockResolvedValue(true);
      mockRestoreMcpConfigBackup.mockReturnValue({ filename: 'b1.json' });
      const ctx = makeCtx();

      const result = await handle_mcp_restore(ctx, 'b1.json');

      expect(result).toBe(true);
      expect(mockRestoreMcpConfigBackup).toHaveBeenCalledWith(ctx.cwd, '/backups/b1.json');
      expect(ctx.ui.notify).toHaveBeenCalledWith('Restored b1.json. Reloading MCP extension...', 'info');
      expect(ctx.reload).toHaveBeenCalled();
    });
  });
});

describe('project-config-loader.js', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjectMcpConfigInfo.mockReturnValue(undefined);
    mockIsProjectSubjectTrusted.mockReturnValue(false);
    mockResolveProjectTrust.mockResolvedValue({ action: 'skip' });
    delete process.env.MY_PI_MCP_PROJECT_CONFIG;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('get_project_mcp_config_load_decision', () => {
    it('returns skipped when no project config exists', async () => {
      mockGetProjectMcpConfigInfo.mockReturnValue(undefined);

      const result = await get_project_mcp_config_load_decision('/cwd');

      expect(result).toEqual({ include_project: false, metadata_trusted: false });
    });

    it('returns include_project when env var is set to allow', async () => {
      process.env.MY_PI_MCP_PROJECT_CONFIG = 'allow';
      mockGetProjectMcpConfigInfo.mockReturnValue({
        path: '/cwd/.mcp.json',
        hash: 'abc',
        servers: [{ name: 's', summary: 'desc' }],
      });

      const result = await get_project_mcp_config_load_decision('/cwd');

      expect(result).toEqual({ include_project: true, metadata_trusted: false });
    });

    it('returns trusted when config is already trusted', async () => {
      mockGetProjectMcpConfigInfo.mockReturnValue({
        path: '/cwd/.mcp.json',
        hash: 'abc',
        servers: [],
      });
      mockIsProjectSubjectTrusted.mockReturnValue(true);

      const result = await get_project_mcp_config_load_decision('/cwd');

      expect(result).toEqual({ include_project: true, metadata_trusted: true });
    });

    it('prompts user when config is not trusted and no env override', async () => {
      mockGetProjectMcpConfigInfo.mockReturnValue({
        path: '/cwd/.mcp.json',
        hash: 'abc',
        servers: [{ name: 'my-server', summary: 'does things' }],
      });
      mockIsProjectSubjectTrusted.mockReturnValue(false);
      mockResolveProjectTrust.mockResolvedValue({ action: 'allow-once' });

      const ctx = makeCtx();
      const result = await get_project_mcp_config_load_decision('/cwd', ctx);

      expect(result).toEqual({ include_project: true, metadata_trusted: false });
      expect(mockResolveProjectTrust).toHaveBeenCalled();
    });

    it('returns skip when user selects skip', async () => {
      mockGetProjectMcpConfigInfo.mockReturnValue({
        path: '/cwd/.mcp.json',
        hash: 'abc',
        servers: [],
      });
      mockIsProjectSubjectTrusted.mockReturnValue(false);
      mockResolveProjectTrust.mockResolvedValue({ action: 'skip' });

      const result = await get_project_mcp_config_load_decision('/cwd', makeCtx());

      expect(result).toEqual({ include_project: false, metadata_trusted: false });
    });

    it('returns trusted when user selects trust', async () => {
      mockGetProjectMcpConfigInfo.mockReturnValue({
        path: '/cwd/.mcp.json',
        hash: 'abc',
        servers: [],
      });
      mockIsProjectSubjectTrusted.mockReturnValue(false);
      mockResolveProjectTrust.mockResolvedValue({ action: 'trust-persisted' });

      const result = await get_project_mcp_config_load_decision('/cwd', makeCtx());

      expect(result).toEqual({ include_project: true, metadata_trusted: true });
    });

    it('works without ctx (headless mode)', async () => {
      mockGetProjectMcpConfigInfo.mockReturnValue({
        path: '/cwd/.mcp.json',
        hash: 'abc',
        servers: [],
      });
      mockIsProjectSubjectTrusted.mockReturnValue(false);
      mockResolveProjectTrust.mockResolvedValue({ action: 'skip' });

      const result = await get_project_mcp_config_load_decision('/cwd');

      expect(result).toEqual({ include_project: false, metadata_trusted: false });
    });
  });
});
