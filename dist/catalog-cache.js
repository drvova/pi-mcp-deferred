import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, } from 'node:fs';
import { dirname, join } from 'node:path';
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
function read_all() {
    try {
        const path = cache_path();
        return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : {};
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
        writeFileSync(tmp, `${JSON.stringify(all, null, 2)}\n`);
        renameSync(tmp, path);
    }
    catch {
        // Cache writes are best-effort; a miss just means one discovery connect.
    }
}
