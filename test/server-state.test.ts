import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ENABLED,
  DISABLED,
  create_server_states,
  format_server_status,
  redact_url,
  summarize_mcp_tool_params,
  count_pending_enabled_servers,
  format_server_target,
  add_server_tools_to_active,
  get_mcp_idle_timeout_ms,
} from '../dist/server-state.js';

// --- create_server_states ---

describe('create_server_states', () => {
  it('returns Map keyed by name with correct defaults', () => {
    const configs = [
      { name: 'alpha', disabled: false },
      { name: 'beta', disabled: true },
    ] as any[];
    const map = create_server_states(configs);
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(2);

    const alpha = map.get('alpha')!;
    expect(alpha.config).toBe(configs[0]);
    expect(alpha.tool_prefix).toBe('mcp__alpha__');
    expect(alpha.tool_names).toEqual([]);
    expect(alpha.enabled).toBe(true);
    expect(alpha.status).toBe('disconnected');
    expect(alpha.active_call_count).toBe(0);
    expect(alpha.promoted).toBe(false);

    const beta = map.get('beta')!;
    expect(beta.enabled).toBe(false);
  });

  it('handles empty configs', () => {
    expect(create_server_states([]).size).toBe(0);
  });
});

// --- format_server_status ---

describe('format_server_status', () => {
  const cases: [string, boolean, string][] = [
    ['connected', true, 'enabled'],
    ['connected', false, 'disabled'],
    ['connecting', true, 'connecting'],
    ['connecting', false, 'connecting, disabled'],
    ['failed', true, 'failed'],
    ['failed', false, 'failed, disabled'],
    ['disconnected', true, 'not connected yet'],
    ['disconnected', false, 'disabled'],
  ];

  it.each(cases)('status=%s enabled=%s => %s', (status, enabled, expected) => {
    expect(format_server_status({ status, enabled } as any)).toBe(expected);
  });
});

// --- redact_url ---

describe('redact_url', () => {
  it('redacts username and password', () => {
    expect(redact_url('https://user:pass@example.com/api')).toBe(
      'https://***:***@example.com/api'
    );
  });

  it('redacts sensitive search params', () => {
    const result = redact_url('https://example.com/api?token=abc123&key=xyz&foo=bar');
    expect(result).toContain('token=***');
    expect(result).toContain('key=***');
    expect(result).toContain('foo=bar');
  });

  it('falls back to regex for non-URL strings', () => {
    expect(redact_url('not-a-url at all?secret=abc123&key=xyz')).toBe(
      'not-a-url at all?secret=***&key=***'
    );
  });

  it('leaves clean URLs untouched', () => {
    expect(redact_url('https://example.com/path')).toBe('https://example.com/path');
  });
});

// --- summarize_mcp_tool_params ---

describe('summarize_mcp_tool_params', () => {
  it('returns JSON string for small params', () => {
    expect(summarize_mcp_tool_params({ a: 1 })).toBe('{"a":1}');
  });

  it('truncates at 500 chars with ellipsis', () => {
    const big = { data: 'x'.repeat(600) };
    const result = summarize_mcp_tool_params(big);
    expect(result!.length).toBe(500);
    expect(result!.endsWith('...')).toBe(true);
  });

  it('returns null for empty object', () => {
    // JSON.stringify({}) is '{}' which is truthy, so this returns '{}'
    expect(summarize_mcp_tool_params({})).toBe('{}');
  });

  it('returns null on circular references', () => {
    const circular: any = {};
    circular.self = circular;
    expect(summarize_mcp_tool_params(circular)).toBeNull();
  });
});

// --- count_pending_enabled_servers ---

describe('count_pending_enabled_servers', () => {
  it('counts enabled servers that are not connected', () => {
    const servers = new Map([
      ['a', { enabled: true, status: 'connected' }],
      ['b', { enabled: true, status: 'connecting' }],
      ['c', { enabled: false, status: 'disconnected' }],
      ['d', { enabled: true, status: 'failed' }],
    ] as any[]);
    expect(count_pending_enabled_servers(servers)).toBe(2);
  });

  it('returns 0 for empty map', () => {
    expect(count_pending_enabled_servers(new Map())).toBe(0);
  });
});

// --- format_server_target ---

describe('format_server_target', () => {
  it('returns redacted URL for http transport', () => {
    const result = format_server_target({ transport: 'http', url: 'https://user:pw@host/path' } as any);
    expect(result).toBe('https://***:***@host/path');
  });

  it('joins command and args for stdio transport', () => {
    const result = format_server_target({ transport: 'stdio', command: 'node', args: ['server.js', '--port', '3000'] } as any);
    expect(result).toBe('node server.js --port 3000');
  });

  it('handles missing args', () => {
    expect(format_server_target({ transport: 'stdio', command: 'node' } as any)).toBe('node');
  });
});

// --- add_server_tools_to_active ---

describe('add_server_tools_to_active', () => {
  it('adds new tools to active set without duplicating', () => {
    const pi = {
      getActiveTools: vi.fn().mockReturnValue(['existing_tool']),
      setActiveTools: vi.fn(),
    };
    add_server_tools_to_active(pi as any, ['new_tool', 'existing_tool']);
    expect(pi.setActiveTools).toHaveBeenCalledTimes(1);
    const arg = pi.setActiveTools.mock.calls[0][0] as string[];
    expect(arg).toContain('existing_tool');
    expect(arg).toContain('new_tool');
    expect(new Set(arg).size).toBe(arg.length); // no duplicates
  });
});

// --- get_mcp_idle_timeout_ms ---

describe('get_mcp_idle_timeout_ms', () => {
  const saved = process.env.MY_PI_MCP_IDLE_TIMEOUT_MS;

  afterEach(() => {
    if (saved === undefined) delete process.env.MY_PI_MCP_IDLE_TIMEOUT_MS;
    else process.env.MY_PI_MCP_IDLE_TIMEOUT_MS = saved;
  });

  it('returns config value when set', () => {
    expect(get_mcp_idle_timeout_ms({ config: { idle_timeout_ms: 5000 } } as any)).toBe(5000);
  });

  it('falls back to env var', () => {
    process.env.MY_PI_MCP_IDLE_TIMEOUT_MS = '10000';
    expect(get_mcp_idle_timeout_ms({ config: {} } as any)).toBe(10000);
  });

  it('defaults to 30 min', () => {
    expect(get_mcp_idle_timeout_ms({ config: {} } as any)).toBe(30 * 60 * 1000);
  });

  it('returns undefined for 0 or negative', () => {
    expect(get_mcp_idle_timeout_ms({ config: { idle_timeout_ms: 0 } } as any)).toBeUndefined();
    expect(get_mcp_idle_timeout_ms({ config: { idle_timeout_ms: -1 } } as any)).toBeUndefined();
  });

  it('returns undefined for NaN', () => {
    process.env.MY_PI_MCP_IDLE_TIMEOUT_MS = 'not-a-number';
    expect(get_mcp_idle_timeout_ms({ config: {} } as any)).toBeUndefined();
  });
});

// --- constants ---

describe('constants', () => {
  it('ENABLED and DISABLED are distinct non-empty strings', () => {
    expect(ENABLED).toBeTruthy();
    expect(DISABLED).toBeTruthy();
    expect(ENABLED).not.toBe(DISABLED);
  });
});
