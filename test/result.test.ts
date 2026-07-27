import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetContextLimits = vi.fn().mockReturnValue({
  max_bytes: 1024,
  max_lines: 50,
});

const mockMaybeStoreContextOutput = vi.fn().mockReturnValue(null);

vi.mock('@spences10/pi-context', () => ({
  get_context_mcp_output_limits: () => mockGetContextLimits(),
  maybe_store_context_output: (opts: any) => mockMaybeStoreContextOutput(opts),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────

import {
  format_mcp_tool_result,
  truncate_mcp_tool_output,
  stringify_mcp_tool_result,
  MCP_RESULT_MAX_BYTES,
  MCP_RESULT_MAX_LINES,
} from '../dist/result.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('result', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `result-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('MCP_RESULT_MAX_BYTES / MCP_RESULT_MAX_LINES', () => {
    it('exports expected default limits', () => {
      expect(MCP_RESULT_MAX_BYTES).toBe(50 * 1024);
      expect(MCP_RESULT_MAX_LINES).toBe(2_000);
    });
  });

  describe('stringify_mcp_tool_result', () => {
    it('joins text fields from content array', () => {
      const result = {
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: 'world' },
        ],
      };
      expect(stringify_mcp_tool_result(result)).toBe('hello\nworld');
    });

    it('skips non-text content items', () => {
      const result = {
        content: [
          { type: 'text', text: 'only-text' },
          { type: 'image', data: 'base64data' },
        ],
      };
      // join('\n') adds separator between all items; non-text maps to ''
      expect(stringify_mcp_tool_result(result)).toBe('only-text\n');
    });

    it('handles empty content array', () => {
      expect(stringify_mcp_tool_result({ content: [] })).toBe('');
    });

    it('handles result without content (JSON stringify fallback)', () => {
      expect(stringify_mcp_tool_result({ error: 'boom' })).toBe('{"error":"boom"}');
    });

    it('handles null result', () => {
      expect(stringify_mcp_tool_result(null)).toBe('null');
    });

    it('handles undefined result', () => {
      expect(stringify_mcp_tool_result(undefined)).toBe('undefined');
    });

    it('handles string result', () => {
      expect(stringify_mcp_tool_result('plain string')).toBe('"plain string"');
    });

    it('handles number result', () => {
      expect(stringify_mcp_tool_result(42)).toBe('42');
    });

    it('handles content items with missing text', () => {
      const result = {
        content: [
          { type: 'text', text: 'ok' },
          { type: 'text' }, // no text
          {}, // no text field
        ],
      };
      expect(stringify_mcp_tool_result(result)).toBe('ok\n\n');
    });
  });

  describe('truncate_mcp_tool_output', () => {
    it('returns text unchanged when under limits', () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 1024, max_lines: 50 });
      const result = truncate_mcp_tool_output('short text');
      expect(result.text).toBe('short text');
      expect(result.details.truncated).toBe(false);
    });

    it('reports correct byte and line counts', () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 1024, max_lines: 50 });
      const result = truncate_mcp_tool_output('line1\nline2\nline3');
      expect(result.details.bytes).toBe(Buffer.byteLength('line1\nline2\nline3', 'utf8'));
      expect(result.details.lines).toBe(3);
    });

    it('truncates when exceeding max_bytes', () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 20, max_lines: 50 });
      const longText = 'x'.repeat(100);

      // mockMaybeStoreContextOutput returns null so it falls through to file write
      mockMaybeStoreContextOutput.mockReturnValue(null);

      const result = truncate_mcp_tool_output(longText, { tmp_dir: tmpDir });
      expect(result.details.truncated).toBe(true);
      expect(result.text).toContain('[MCP output truncated:');
    });

    it('truncates when exceeding max_lines', () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 10_000, max_lines: 3 });
      const manyLines = Array.from({ length: 10 }, (_, i) => `line-${i}`).join('\n');

      mockMaybeStoreContextOutput.mockReturnValue(null);

      const result = truncate_mcp_tool_output(manyLines, { tmp_dir: tmpDir });
      expect(result.details.truncated).toBe(true);
      expect(result.text).toContain('[MCP output truncated:');
    });

    it('uses custom max_bytes/max_lines when provided', () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 100_000, max_lines: 10_000 });
      const text = 'x'.repeat(50);

      // With override max_bytes=10, should truncate
      mockMaybeStoreContextOutput.mockReturnValue(null);
      const result = truncate_mcp_tool_output(text, { max_bytes: 10, tmp_dir: tmpDir });
      expect(result.details.truncated).toBe(true);
    });

    it('saves full output to file when truncated', () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 10, max_lines: 100 });
      mockMaybeStoreContextOutput.mockReturnValue(null);

      const longText = 'a'.repeat(200);
      const result = truncate_mcp_tool_output(longText, { tmp_dir: tmpDir });

      expect(result.details.truncated).toBe(true);
      expect(result.details.full_output_path).toBeDefined();
      // The file should exist and contain the full output
      const saved = readFileSync(result.details.full_output_path!, 'utf-8');
      expect(saved).toBe(longText);
    });

    it('uses context storage when available', () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 10, max_lines: 100 });
      mockMaybeStoreContextOutput.mockReturnValue({
        receipt: 'Context receipt here',
        preview: 'short preview',
        source_id: 'src_abc',
      });

      const result = truncate_mcp_tool_output('a'.repeat(200), { tool_name: 'my-tool' });
      expect(result.text).toBe('Context receipt here');
      expect(result.details.truncated).toBe(true);
      expect(result.details.full_output_path).toBe('context:src_abc');
    });

    it('does not write file when not truncated', () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 100_000, max_lines: 10_000 });
      const result = truncate_mcp_tool_output('small');
      expect(result.details.full_output_path).toBeUndefined();
    });

    it('returns text as-is with correct details when not truncated', () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 1024, max_lines: 100 });
      const result = truncate_mcp_tool_output('hello');
      expect(result.text).toBe('hello');
      expect(result.details).toEqual({
        truncated: false,
        bytes: 5,
        lines: 1,
        max_bytes: 1024,
        max_lines: 100,
      });
    });
  });

  describe('format_mcp_tool_result', () => {
    it('stringifies and truncates in one step', async () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 10_000, max_lines: 100 });
      const input = {
        content: [{ type: 'text', text: 'combined output' }],
      };
      const result = await format_mcp_tool_result(input);
      expect(result.text).toBe('combined output');
    });

    it('passes options through to truncate', async () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 10_000, max_lines: 100 });
      // stringify_mcp_tool_result('ok') => '"ok"' (4 bytes), so max_bytes=3 triggers truncation
      const result = await format_mcp_tool_result('ok', { max_bytes: 3, tmp_dir: tmpDir });
      expect(result.details.truncated).toBe(true);
    });

    it('handles string input directly', async () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 10_000, max_lines: 100 });
      // stringify_mcp_tool_result('plain text') => '"plain text"' via JSON.stringify
      const result = await format_mcp_tool_result('plain text');
      expect(result.text).toBe('"plain text"');
    });

    it('annotates multi-line results with hashline anchors', async () => {
      mockGetContextLimits.mockReturnValue({ max_bytes: 10_000, max_lines: 100 });
      const input = {
        content: [{ type: 'text', text: JSON.stringify({ servers: [{ name: 'github' }] }, null, 2) }],
      };
      const result = await format_mcp_tool_result(input);
      // Each line should start with a 3-char hash followed by the separator
      const lines = result.text.split('\n');
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line).toMatch(/^[A-Za-z0-9\-_]{3}\u2502/);
      }
      expect(result.details.hashline).toBe(true);
    });
  });
});
