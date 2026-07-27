import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, } from 'node:fs';
import { dirname, join } from 'node:path';
import { lineHashes, fmtRegion } from './hashline.js';
// Per-server tool metadata cached to disk so the catalog listing (mcp__expand)
// can be built at session_start WITHOUT spawning every MCP server. Servers only
// connect when a tool is actually used — this is what keeps subagent sessions
// from leaking a fresh process pool per child.
// Per-server tool metadata cached to disk so the catalog listing (mcp__expand)
// can be built at session_start WITHOUT spawning every MCP server. Servers only
// connect when a tool is actually used — this is what keeps subagent sessions
// from leaking a fresh process pool per child.
function cache_path() {
    return join(getAgentDir(), 'mcp-catalog-cache.json');
}
function config_sig(config) {
    return config.transport === 'http'
        ? `http:${config.url}`
        : `stdio:${config.command} ${(config.args ?? []).join(' ')}`;
}
function stripHashline(content) {
    return content.split('\n').map(line => line[3] === '│' ? line.slice(4) : line).join('\n');
}
function tryAnnotate(content) {
    try {
        return fmtRegion(lineHashes(content), content.split('\n'));
    }
    catch {
        return content;
    }
}
function read_all() {
    try {
        const path = cache_path();
        if (!existsSync(path)) return {};
        const raw = readFileSync(path, 'utf-8');
        return JSON.parse(raw[3] === '│' ? stripHashline(raw) : raw);
    }
    catch {
        return {};
    }
}
export function read_cached_tools(config) {
    const entry = read_all()[config.name];
    if (!entry || entry.sig !== config_sig(config) || !Array.isArray(entry.tools))
        return undefined;
    return entry.tools;
}
export function read_cached_tools_batch(configs) {
    const all = read_all();
    const result = new Map();
    for (const config of configs) {
        const entry = all[config.name];
        if (entry && entry.sig === config_sig(config) && Array.isArray(entry.tools))
            result.set(config.name, entry.tools);
    }
    return result;
}
export function write_cached_tools(config, tools) {
    try {
        const path = cache_path();
        const all = read_all();
        all[config.name] = {
            sig: config_sig(config),
            tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            })),
        };
        mkdirSync(dirname(path), { recursive: true });
        const tmp = join(dirname(path), `.mcp-catalog-${Date.now()}.tmp`);
        writeFileSync(tmp, `${tryAnnotate(JSON.stringify(all, null, 2))}\n`);
        renameSync(tmp, path);
    }
    catch {
        // Cache writes are best-effort; a miss just means one discovery connect.
    }
}
export function read_cached_tools_annotated(config) {
    const entry = read_all()[config.name];
    if (!entry || entry.sig !== config_sig(config) || !Array.isArray(entry.tools))
        return undefined;
    const json = JSON.stringify(entry.tools, null, 2);
    return tryAnnotate(json);
}
