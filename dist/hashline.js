/**
 * Hashline annotation for MCP tool results.
 *
 * Computes xxh32-based 3-char base64url hashes per line, matching the
 * format used by pi-hashline-edit-pro so the hashline `replace` tool
 * can edit MCP results directly.
 *
 * When hashline-edit-pro is installed, its replace tool validates hashes
 * by recomputing them against the file content. The hashes we compute
 * here must match exactly: xxh32, canon (strip \r + trim trailing ws),
 * top 18 bits, base64url alphabet, collision resolution with :R{n}.
 */

let _h32 = null;
let _initPromise = null;

const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ALPH_BITS = 6;
const ALPH_MASK = (1 << ALPH_BITS) - 1;
const HASH_LEN = 3;

function h2s(h) {
    const n = (h >>> 0) >>> (32 - HASH_LEN * ALPH_BITS);
    let out = '';
    for (let j = 0; j < HASH_LEN; j++) {
        out += ALPH[(n >>> ((HASH_LEN - 1 - j) * ALPH_BITS)) & ALPH_MASK];
    }
    return out;
}

function canon(line) {
    return line.replace(/\r/g, '').trimEnd();
}

function nextUniqueHash(content, used) {
    let retry = 0;
    let hash = h2s(_h32(content));
    while (used.has(hash)) {
        retry++;
        if (retry > 100) throw new Error('Hash space exhausted');
        hash = h2s(_h32(`${content}:R${retry}`));
    }
    used.add(hash);
    return hash;
}

export function initHashline() {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        const mod = await import('xxhash-wasm');
        const xxh = await mod.default();
        _h32 = (input) => xxh.h32(input) >>> 0;
    })();
    return _initPromise;
}

export function lineHashes(content) {
    if (!_h32) throw new Error('hashline not initialized — call initHashline() first');
    const lines = content.split('\n');
    const hashes = new Array(lines.length);
    const used = new Set();
    for (let i = 0; i < lines.length; i++) {
        hashes[i] = nextUniqueHash(canon(lines[i]), used);
    }
    return hashes;
}

export function fmtRegion(hashes, lines) {
    return lines.map((line, i) => `${hashes[i]}│${line}`).join('\n');
}

export function hashlineAnnotate(content) {
    const lines = content.split('\n');
    const hashes = lineHashes(content);
    return fmtRegion(hashes, lines);
}

export async function hashlineAnnotateAsync(content) {
    await initHashline();
    return hashlineAnnotate(content);
}

const SKIP_HASH = '___';

function matchesAny(line, patterns) {
    for (let i = 0; i < patterns.length; i++) {
        const pat = patterns[i];
        if (typeof pat === 'string' ? line.includes(pat) : pat.test(line)) return true;
    }
    return false;
}

function redactContent(line, patterns, replacement) {
    let result = line;
    for (let i = 0; i < patterns.length; i++) {
        result = result.replaceAll(patterns[i], replacement);
    }
    return result;
}

export function hashlineAnnotateSelective(content, { skipPatterns = [] } = {}) {
    if (!_h32) throw new Error('hashline not initialized — call initHashline() first');
    const lines = content.split('\n');
    const used = new Set();
    used.add(SKIP_HASH);
    const hashes = new Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
        hashes[i] = matchesAny(lines[i], skipPatterns) ? SKIP_HASH : nextUniqueHash(canon(lines[i]), used);
    }
    return fmtRegion(hashes, lines);
}

export function hashlineAnnotateRedacted(content, { redactPatterns = [], replacement = '***' } = {}) {
    if (!_h32) throw new Error('hashline not initialized — call initHashline() first');
    const lines = content.split('\n');
    const used = new Set();
    used.add(SKIP_HASH);
    const hashes = new Array(lines.length);
    const redacted = new Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (matchesAny(line, redactPatterns)) {
            hashes[i] = SKIP_HASH;
            redacted[i] = redactContent(line, redactPatterns, replacement);
        } else {
            hashes[i] = nextUniqueHash(canon(line), used);
            redacted[i] = line;
        }
    }
    return [fmtRegion(hashes, redacted), redacted.join('\n')];
}

export function computeHashes(content) {
    if (!_h32) throw new Error('hashline not initialized — call initHashline() first');
    return lineHashes(content);
}

export const HASHLINE_SEP = '│';
