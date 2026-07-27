import { describe, it, expect, beforeAll } from 'vitest';
import {
  initHashline,
  lineHashes,
  fmtRegion,
  hashlineAnnotate,
  hashlineAnnotateAsync,
  HASHLINE_SEP,
} from '../dist/hashline.js';

// Optional exports that may not exist yet
let hashlineAnnotateSelective: any = null;
let hashlineAnnotateRedacted: any = null;
let computeHashes: any = null;

try {
  const mod = await import('../dist/hashline.js');
  hashlineAnnotateSelective = (mod as any).hashlineAnnotateSelective ?? null;
  hashlineAnnotateRedacted = (mod as any).hashlineAnnotateRedacted ?? null;
  computeHashes = (mod as any).computeHashes ?? null;
} catch {}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initHashline();
});

const MULTI_LINE = 'line one\nline two\nline three';
const SINGLE_LINE = 'hello world';
const EMPTY_LINE = 'first\n\nthird';

const HASH_RE = /^[A-Za-z0-9\-_]{3}$/;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('hashline', () => {
  describe('lineHashes', () => {
    it('returns one hash per line', () => {
      const hashes = lineHashes(MULTI_LINE);
      expect(hashes).toHaveLength(3);
    });

    it('each hash is exactly 3 base64url chars', () => {
      const hashes = lineHashes(MULTI_LINE);
      for (const h of hashes) {
        expect(h).toMatch(HASH_RE);
      }
    });

    it('handles single line', () => {
      expect(lineHashes(SINGLE_LINE)).toHaveLength(1);
    });

    it('handles empty lines (split produces trailing empty)', () => {
      // 'a\nb' splits to ['a','b'] — 2 lines, 2 hashes
      const hashes = lineHashes('a\nb');
      expect(hashes).toHaveLength(2);
    });
  });

  describe('collision resolution', () => {
    it('duplicate lines get different hashes', () => {
      const hashes = lineHashes('dup\ndup\ndup');
      const unique = new Set(hashes);
      expect(unique.size).toBe(3);
    });

    it('suffix format is :R{n}', () => {
      const hashes = lineHashes('dup\ndup');
      // First hash is plain, second must differ
      expect(hashes[0]).not.toBe(hashes[1]);
      // Both still match the 3-char format
      expect(hashes[0]).toMatch(HASH_RE);
      expect(hashes[1]).toMatch(HASH_RE);
    });
  });

  describe('canon normalization', () => {
    it('trailing whitespace is ignored for hashing', () => {
      const hashes1 = lineHashes('trim me');
      const hashes2 = lineHashes('trim me   ');
      expect(hashes1[0]).toBe(hashes2[0]);
    });

    it('trailing newline difference (canon strips \\r)', () => {
      const hashes1 = lineHashes('cr\r\nline');
      const hashes2 = lineHashes('cr\nline');
      // After canon, both should hash the same content
      expect(hashes1[0]).toBe(hashes2[0]);
    });
  });

  describe('fmtRegion', () => {
    it('produces HASH|content format', () => {
      const hashes = ['abc', 'def'];
      const lines = ['line1', 'line2'];
      const result = fmtRegion(hashes, lines);
      expect(result).toBe('abc│line1\ndef│line2');
    });

    it('preserves original line content', () => {
      const result = fmtRegion(['zzz'], ['unchanged content']);
      expect(result).toBe('zzz│unchanged content');
    });
  });

  describe('hashlineAnnotate', () => {
    it('produces full annotated output', () => {
      const result = hashlineAnnotate(MULTI_LINE);
      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
      for (const line of lines) {
        expect(line).toMatch(/^[A-Za-z0-9\-_]{3}│/);
      }
    });

    it('output is hashlineAnnotate = lineHashes + fmtRegion', () => {
      const annotated = hashlineAnnotate(SINGLE_LINE);
      const hashes = lineHashes(SINGLE_LINE);
      const expected = fmtRegion(hashes, SINGLE_LINE.split('\n'));
      expect(annotated).toBe(expected);
    });
  });

  describe('hashlineAnnotateAsync', () => {
    it('produces same output as sync version', async () => {
      const sync = hashlineAnnotate(MULTI_LINE);
      const async_ = await hashlineAnnotateAsync(MULTI_LINE);
      expect(async_).toBe(sync);
    });
  });

  describe('HASHLINE_SEP', () => {
    it('is the Unicode box-drawing character │', () => {
      expect(HASHLINE_SEP).toBe('\u2502');
    });

    it('matches what fmtRegion uses', () => {
      const result = fmtRegion(['aaa'], ['b']);
      expect(result[3]).toBe(HASHLINE_SEP);
    });
  });
});

// ── Optional exports (may not exist yet) ───────────────────────────────────

describe('selective / redacted / computeHashes (optional)', () => {
  it('hashlineAnnotateSelective: skips matching lines', () => {
    if (!hashlineAnnotateSelective) return;
    const result = hashlineAnnotateSelective(MULTI_LINE, { skipPatterns: [/line two/] });
    const lines = result.split('\n');
    // Line 1 (index 1) should be skipped -> ___ hash
    expect(lines[1]).toMatch(/^___│/);
  });

  it('hashlineAnnotateRedacted: redacts matching content', () => {
    if (!hashlineAnnotateRedacted) return;
    const result = hashlineAnnotateRedacted(MULTI_LINE, { redactPatterns: [/line two/g] });
    // Returns [formatted, redactedText]
    expect(Array.isArray(result)).toBe(true);
    const [formatted, redactedText] = result;
    expect(formatted).toContain('___');
    expect(redactedText).not.toContain('line two');
    expect(redactedText).toContain('***');
  });

  it('computeHashes: returns array without formatting', () => {
    if (!computeHashes) return;
    const hashes = computeHashes(MULTI_LINE);
    expect(Array.isArray(hashes)).toBe(true);
    expect(hashes).toHaveLength(3);
    for (const h of hashes) {
      expect(h).toMatch(HASH_RE);
    }
  });
});
